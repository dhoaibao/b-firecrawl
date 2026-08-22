import { Body, Controller, Get, Inject, Put, UseGuards } from "@nestjs/common";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import { decryptSettingValue, encryptSettingValue } from "../common/crypto";
import { apiError } from "../common/http";
import { AuthGuard } from "../auth/guards";
import { SettingsService, VALID_ROUTE_MODES } from "./settings.service";

const VALID_SETTINGS = ["firecrawl_api_keys", "api_key_inactivity_revoke_days", "default_route_mode", "self_hosted_firecrawl_url"] as const;
const SETTING_TYPES: Record<string, "string" | "number" | "json"> = {
  firecrawl_api_keys: "json", api_key_inactivity_revoke_days: "number",
  default_route_mode: "string", self_hosted_firecrawl_url: "string",
};
const MAX_CLOUD_API_KEYS = 10;
const MIN_API_KEY_LENGTH = 8;
const CREDIT_USAGE_CACHE_TTL_MS = 30_000;

export interface CreditUsageItem { keyIndex: number; keyPrefix: string; remainingCredits: number | null; planCredits: number | null; billingPeriodStart: string | null; billingPeriodEnd: string | null; error?: string }
type CreditUsageDetails = Omit<CreditUsageItem, "keyIndex" | "keyPrefix">;

@Controller("admin/api/settings")
@UseGuards(AuthGuard)
export class SettingsController {
  private readonly creditUsageInFlight = new Map<string, Promise<CreditUsageDetails>>();
  private readonly creditUsageCache = new Map<string, { details: CreditUsageDetails; expiresAt: number }>();

  constructor(private readonly settings: SettingsService, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  @Get("credit-usage")
  async creditUsage() { return { data: await this.fetchCreditUsage() }; }

  @Get()
  async list() {
    const rows = await this.settings.listSettings();
    const data: Record<string, unknown> = {};
    for (const row of rows) {
      const value = row.key === "firecrawl_api_keys" ? decryptSettingValue(row.value, this.config.firecrawlKeysEncryptionKey) : { value: row.value, encrypted: false };
      data[row.key] = parseValue(value.value, SETTING_TYPES[row.key] || "string");
      if (row.key === "firecrawl_api_keys" && !value.encrypted) await this.settings.setSetting(row.key, encryptSettingValue(row.value, this.config.firecrawlKeysEncryptionKey));
    }
    return { data };
  }

  @Put()
  async update(@Body() updates: unknown) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) apiError(400, "Expected JSON object with settings");
    const result: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(updates as Record<string, unknown>)) {
      if (!VALID_SETTINGS.includes(key as typeof VALID_SETTINGS[number])) apiError(400, `Invalid setting key: ${key}`);
      const type = SETTING_TYPES[key] || "string";
      let value: string;
      if (key === "default_route_mode") {
        if (typeof rawValue !== "string" || !(VALID_ROUTE_MODES as readonly string[]).includes(rawValue)) apiError(400, `${key} must be one of ${VALID_ROUTE_MODES.join(", ")}`);
        value = rawValue;
      } else if (key === "self_hosted_firecrawl_url") {
        const rawUrl = String(rawValue).trim();
        if (!rawUrl) value = "";
        else { try { const url = new URL(rawUrl); if (!/^https?:$/.test(url.protocol) || !url.hostname) throw new Error(); value = url.toString().replace(/\/+$/, ""); } catch { apiError(400, `${key} must be a valid HTTP(S) URL`); } }
      } else if (type === "json") {
        if (!Array.isArray(rawValue)) apiError(400, `${key} must be an array of API keys`);
        if ((rawValue as unknown[]).length > MAX_CLOUD_API_KEYS) apiError(400, `${key} may contain at most ${MAX_CLOUD_API_KEYS} keys`);
        if ((rawValue as unknown[]).some((item) => typeof item !== "string" || item.length < MIN_API_KEY_LENGTH)) apiError(400, `${key} must be an array of API key strings with at least ${MIN_API_KEY_LENGTH} characters`);
        value = JSON.stringify(rawValue);
        if (key === "firecrawl_api_keys") value = encryptSettingValue(value, this.config.firecrawlKeysEncryptionKey);
      } else if (type === "number") {
        const number = Number(rawValue); if (!Number.isFinite(number) || number < 0) apiError(400, `${key} must be a non-negative number`); value = String(number);
      } else value = String(rawValue);
      await this.settings.setSetting(key, value);
      result[key] = parseValue(key === "firecrawl_api_keys" ? JSON.stringify(rawValue) : value, type);
    }
    return { data: result };
  }

  private async fetchCreditUsage(): Promise<CreditUsageItem[]> {
    const record = await this.settings.getSetting("firecrawl_api_keys");
    if (!record?.value) return [];
    let keys: string[];
    try {
      const decrypted = decryptSettingValue(record.value, this.config.firecrawlKeysEncryptionKey);
      if (!decrypted.encrypted) await this.settings.setSetting(record.key, encryptSettingValue(record.value, this.config.firecrawlKeysEncryptionKey));
      const parsed = JSON.parse(decrypted.value) as unknown;
      keys = Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
    } catch { return []; }
    return Promise.all(keys.map((key, index) => this.fetchCreditUsageForKey(index, key)));
  }

  private async fetchCreditUsageForKey(keyIndex: number, apiKey: string): Promise<CreditUsageItem> {
    const keyPrefix = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    const cached = this.creditUsageCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) return { keyIndex, keyPrefix, ...cached.details };
    if (cached) this.creditUsageCache.delete(apiKey);
    const existing = this.creditUsageInFlight.get(apiKey);
    if (existing) {
      const details = await existing;
      return { keyIndex, keyPrefix, ...details };
    }
    const request = (async (): Promise<CreditUsageDetails> => {
      try {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
        let response: Response;
        try { response = await fetch(`${this.config.cloudBaseUrl}/v2/team/credit-usage`, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        if (!response.ok) return { remainingCredits: null, planCredits: null, billingPeriodStart: null, billingPeriodEnd: null, error: `HTTP ${response.status}: ${await response.text() || response.statusText}` };
        const json = await response.json() as { data?: { remainingCredits?: number; planCredits?: number; billingPeriodStart?: string | null; billingPeriodEnd?: string | null } };
        return { remainingCredits: json.data?.remainingCredits ?? null, planCredits: json.data?.planCredits ?? null, billingPeriodStart: json.data?.billingPeriodStart ?? null, billingPeriodEnd: json.data?.billingPeriodEnd ?? null };
      } catch (error) { return { remainingCredits: null, planCredits: null, billingPeriodStart: null, billingPeriodEnd: null, error: (error as Error).message }; }
    })();
    this.creditUsageInFlight.set(apiKey, request);
    try {
      const details = await request;
      if (!details.error) this.creditUsageCache.set(apiKey, { details, expiresAt: Date.now() + CREDIT_USAGE_CACHE_TTL_MS });
      return { keyIndex, keyPrefix, ...details };
    } finally {
      if (this.creditUsageInFlight.get(apiKey) === request) {
        this.creditUsageInFlight.delete(apiKey);
      }
    }
  }
}

function parseValue(value: string, type: string): unknown {
  if (type === "json") { try { return JSON.parse(value); } catch { return value; } }
  if (type === "number") { const number = Number(value); return Number.isFinite(number) ? number : value; }
  return value;
}
