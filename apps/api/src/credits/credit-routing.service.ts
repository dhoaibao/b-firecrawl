import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import { decryptSettingValue } from "../common/crypto";
import { RedisCreditLedgerStore } from "./credit-ledger.store";

export interface CreditUsageDetails {
  remainingCredits: number | null;
  planCredits: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  error?: string;
}

export interface CreditReservation {
  key: string;
  keyId: string;
  amount: number;
  source: "redis" | "local";
  reservationKey?: string;
}

const CREDIT_USAGE_CACHE_TTL_MS = 30_000;
const CREDIT_KEY_COOLDOWN_MS = 30_000;
const REDIS_FAILURE_COOLDOWN_MS = 5_000;

@Injectable()
export class CreditRoutingService {
  private readonly creditUsageInFlight = new Map<string, Promise<CreditUsageDetails>>();
  private readonly creditUsageCache = new Map<string, { details: CreditUsageDetails; expiresAt: number }>();
  private readonly localCooldownUntil = new Map<string, number>();
  private readonly localDisabled = new Set<string>();
  private localCursor = 0;
  private redisUnavailableUntil = 0;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly ledger: RedisCreditLedgerStore,
  ) {}

  keyId(apiKey: string): string {
    return crypto.createHmac("sha256", Buffer.from(this.config.firecrawlKeysEncryptionKey, "hex")).update(apiKey).digest("hex");
  }

  async reserve(apiKeys: string[], amount: number, excludedKeyIds: ReadonlySet<string> = new Set()): Promise<CreditReservation | null> {
    const normalizedAmount = Math.max(1, Math.ceil(amount));
    const now = Date.now();
    const candidates = apiKeys
      .map((key) => ({ key, keyId: this.keyId(key) }))
      .filter(({ keyId }) => !excludedKeyIds.has(keyId))
      .filter(({ keyId }) => !this.localDisabled.has(keyId) && (this.localCooldownUntil.get(keyId) || 0) <= now);
    if (!candidates.length) return null;

    if (Date.now() >= this.redisUnavailableUntil) {
      const result = await this.ledger.reserve(candidates.map(({ keyId }) => keyId), normalizedAmount);
      if (result.kind === "reserved") {
        this.redisUnavailableUntil = 0;
        const selected = candidates[result.index];
        if (selected) return { ...selected, amount: normalizedAmount, source: "redis", reservationKey: result.reservationKey };
      } else if (result.kind === "no-capacity") {
        return null;
      } else {
        this.redisUnavailableUntil = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
      }
    }

    return this.reserveLocally(candidates, normalizedAmount);
  }

  async recordResponse(reservation: CreditReservation, status: number): Promise<void> {
    if (status === 402) {
      this.localDisabled.add(reservation.keyId);
      this.localCooldownUntil.delete(reservation.keyId);
      if (reservation.source === "redis" && reservation.reservationKey) {
        await this.ledger.settle(reservation.keyId, reservation.reservationKey, "disabled");
      }
      return;
    }

    if (status === 429) {
      const cooldownUntil = Date.now() + CREDIT_KEY_COOLDOWN_MS;
      this.localCooldownUntil.set(reservation.keyId, cooldownUntil);
      if (reservation.source === "redis" && reservation.reservationKey) {
        await this.ledger.settle(reservation.keyId, reservation.reservationKey, "cooldown", cooldownUntil);
      }
      return;
    }

    // Authentication failures are rejected before useful work is performed;
    // return their estimate to the pool. Other responses remain reserved until
    // the next authoritative refresh because the upstream may have consumed it.
    if ((status === 401 || status === 403) && reservation.source === "redis" && reservation.reservationKey) {
      await this.ledger.settle(reservation.keyId, reservation.reservationKey, "refund");
    }
  }

  async refreshCreditUsage(apiKey: string): Promise<CreditUsageDetails> {
    const cached = this.creditUsageCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) return cached.details;
    if (cached) this.creditUsageCache.delete(apiKey);

    const existing = this.creditUsageInFlight.get(apiKey);
    if (existing) return existing;

    const request = (async (): Promise<CreditUsageDetails> => {
      const keyId = this.keyId(apiKey);
      const snapshot = await this.ledger.capture(keyId);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        let response: Response;
        try {
          response = await fetch(`${this.config.cloudBaseUrl}/v2/team/credit-usage`, {
            headers: { authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          return {
            remainingCredits: null,
            planCredits: null,
            billingPeriodStart: null,
            billingPeriodEnd: null,
            error: `HTTP ${response.status}: ${await response.text() || response.statusText}`,
          };
        }

        const json = await response.json() as { data?: {
          remainingCredits?: number;
          planCredits?: number;
          billingPeriodStart?: string | null;
          billingPeriodEnd?: string | null;
        } };
        const remainingCredits = json.data?.remainingCredits;
        const details: CreditUsageDetails = {
          remainingCredits: typeof remainingCredits === "number" && Number.isFinite(remainingCredits) ? remainingCredits : null,
          planCredits: typeof json.data?.planCredits === "number" && Number.isFinite(json.data.planCredits) ? json.data.planCredits : null,
          billingPeriodStart: json.data?.billingPeriodStart ?? null,
          billingPeriodEnd: json.data?.billingPeriodEnd ?? null,
        };
        if (details.remainingCredits === null) return { ...details, error: "Credit usage response did not include remainingCredits" };

        if (snapshot.available) {
          await this.ledger.reconcile(keyId, details.remainingCredits, snapshot.sequence);
        }
        if (details.remainingCredits > 0) {
          this.localDisabled.delete(keyId);
          if ((this.localCooldownUntil.get(keyId) || 0) <= Date.now()) this.localCooldownUntil.delete(keyId);
        } else {
          this.localDisabled.add(keyId);
        }
        return details;
      } catch (error) {
        return {
          remainingCredits: null,
          planCredits: null,
          billingPeriodStart: null,
          billingPeriodEnd: null,
          error: (error as Error).message,
        };
      }
    })();
    this.creditUsageInFlight.set(apiKey, request);
    try {
      const details = await request;
      if (!details.error) this.creditUsageCache.set(apiKey, { details, expiresAt: Date.now() + CREDIT_USAGE_CACHE_TTL_MS });
      return details;
    } finally {
      if (this.creditUsageInFlight.get(apiKey) === request) this.creditUsageInFlight.delete(apiKey);
    }
  }

  async refreshCreditUsageForKeys(apiKeys: string[]): Promise<CreditUsageDetails[]> {
    return Promise.all(apiKeys.map((apiKey) => this.refreshCreditUsage(apiKey)));
  }

  private async reserveLocally(candidates: Array<{ key: string; keyId: string }>, amount: number): Promise<CreditReservation | null> {
    const now = Date.now();
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (this.localCursor + offset) % candidates.length;
      const candidate = candidates[index];
      if (this.localDisabled.has(candidate.keyId)) continue;
      if ((this.localCooldownUntil.get(candidate.keyId) || 0) > now) continue;
      this.localCursor = (index + 1) % candidates.length;
      return { ...candidate, amount, source: "local" };
    }
    return null;
  }
}

/**
 * Estimates one credit per proxied cloud request. The pathname/body are part
 * of the interface so endpoint-specific modifiers can be added only when the
 * gateway has enough request-level evidence to do so; it intentionally does
 * not guess at Firecrawl's endpoint billing rules.
 */
export function estimateCreditCost(_pathname: string, _body: unknown): number {
  return 1;
}

export function parseCreditKeys(value: string, encryptionKey: string): { keys: string[]; encrypted: boolean } {
  const decrypted = decryptSettingValue(value, encryptionKey);
  const parsed = JSON.parse(decrypted.value) as unknown;
  return {
    keys: Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string" && key.length > 0) : [],
    encrypted: decrypted.encrypted,
  };
}

export function creditKeyPrefix(apiKey: string): string {
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

