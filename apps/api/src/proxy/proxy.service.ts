import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { FastifyReply } from "fastify";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import type { AuditEntry, ProxyResult, RequestWithContext } from "../common/types";
import { cryptoRandomId, collectTargetUrls, hasPrivateTargetUrl, inspectBody, nowIso, shuffleArray } from "../common/utils";
import { decryptSettingValue, encryptSettingValue } from "../common/crypto";
import { chooseInitialBackend, getRouteMode, hasSensitiveHeaders, isCloudQuotaFallbackAllowed, isFallbackAllowed, isFallbackEligible, requestNeedsCloud } from "./policy";
import { SettingsService, type RouteMode } from "../settings/settings.service";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { AuditService } from "../audit/audit.service";

const hopByHopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"]);
const RETRYABLE_CLOUD_STATUS = new Set([401, 403, 429]);
const CREDIT_USAGE_CACHE_TTL_MS = 30_000;
const creditUsageCache = new Map<string, { remainingCredits: number; expiresAt: number }>();
const creditUsageInFlight = new Map<string, Promise<number | null>>();

@Injectable()
export class ProxyService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly settings: SettingsService,
    private readonly keys: ApiKeysService,
    private readonly audit: AuditService,
  ) {}

  async handle(request: RequestWithContext, reply: FastifyReply, originalUrl = request.raw.url || request.url): Promise<void> {
    const started = Date.now();
    let parsedUrl: URL;
    try { parsedUrl = new URL(originalUrl, "http://gateway.local"); }
    catch { reply.code(400).send({ success: false, error: "Invalid request URL" }); return; }
    let primaryTargetUrl = "";
    let routeMode: string = this.configDefaultRouteMode();
    const appendAuditEntry = async (backendUsed: string, statusCode: number, fallbackUsed = false, fallbackReason = "") => {
      const entry: AuditEntry = { id: cryptoRandomId(), created_at: nowIso(), method: request.method, path: parsedUrl.pathname,
        route_mode: routeMode, backend_used: backendUsed, fallback_used: fallbackUsed, fallback_reason: fallbackReason,
        status_code: statusCode, duration_ms: Date.now() - started, target_url: primaryTargetUrl,
        request_id: request.requestId };
      await this.audit.appendAudit(entry);
    };

    const [defaultRouteMode, selfHostedSetting] = await Promise.all([
      this.settings.getDefaultRouteMode(this.configDefaultRouteMode()),
      this.settings.getSetting("self_hosted_firecrawl_url"),
    ]);
    const selfHostedBaseUrl = selfHostedSetting?.value?.replace(/\/+$/, "") || "";
    routeMode = getRouteMode(originalUrl, request.headers, defaultRouteMode);

    let apiKey: string | undefined;
    if (this.config.authEnabled && !request.admin) {
      const authHeader = String(request.headers.authorization || "");
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) { await appendAuditEntry("none", 401, false, "Missing or invalid API key"); reply.code(401).send({ success: false, error: "Missing or invalid API key" }); return; }
      apiKey = match[1];
      const authenticated = await this.keys.validateApiKey(apiKey);
      if (!authenticated) { await appendAuditEntry("none", 401, false, "Invalid or revoked API key"); reply.code(401).send({ success: false, error: "Invalid or revoked API key" }); return; }
      void this.keys.touchApiKey(authenticated.id).catch(() => undefined);
    }

    const bodyBuffer = this.getBodyBuffer(request);
    if (bodyBuffer.length > this.config.maxBodyBytes) { await appendAuditEntry("none", 413, false, "Request body is too large for gateway inspection"); reply.code(413).send({ success: false, error: "Request body is too large for gateway inspection" }); return; }
    const { json, parseError } = inspectBody(request.body, request.headers);
    if (parseError) { await appendAuditEntry("none", 400, false, parseError); reply.code(400).send({ success: false, error: "Invalid JSON body", details: parseError }); return; }
    const targetUrls = collectTargetUrls(json);
    primaryTargetUrl = targetUrls[0] || "";
    const privacy = { hasSensitiveHeaders: hasSensitiveHeaders(this.privacyHeaders(request), json), hasPrivateTargetUrl: hasPrivateTargetUrl(targetUrls) };
    const needsCloud = requestNeedsCloud(parsedUrl.pathname, json);
    const initialBackend = chooseInitialBackend(routeMode, needsCloud);
    let cloudApiKeys: string[] = [];
    if (initialBackend === "cloud" || (initialBackend === "self-hosted" && routeMode !== "self-hosted-only" && isFallbackAllowed(routeMode, privacy))) cloudApiKeys = await this.getCloudApiKeys();
    const primaryCloudApiKey = cloudApiKeys[0];
    if (initialBackend === "cloud" && !primaryCloudApiKey) { await appendAuditEntry("none", 502, false, "No Firecrawl Cloud API key configured"); reply.code(502).send({ success: false, error: "No Firecrawl Cloud API key configured. Add one in Settings." }); return; }
    if (initialBackend === "reject") { await appendAuditEntry("none", 409, false, needsCloud.reason); reply.code(409).send({ success: false, error: "This request requires Firecrawl Cloud, but route mode is self-hosted-only.", reason: needsCloud.reason }); return; }

    let result = await this.proxyToBackend(initialBackend, request, bodyBuffer, this.backendUrl(initialBackend, originalUrl, selfHostedBaseUrl), primaryCloudApiKey);
    let fallbackUsed = false; let fallbackReason = "";
    if (initialBackend === "self-hosted" && Boolean(primaryCloudApiKey) && isFallbackEligible(result) && isFallbackAllowed(routeMode, privacy)) {
      fallbackUsed = true; fallbackReason = result.kind === "network-error" ? result.error?.message || "self-hosted network error" : `self-hosted returned ${result.response?.status}`;
      result = await this.proxyToBackend("cloud", request, bodyBuffer, this.backendUrl("cloud", originalUrl, selfHostedBaseUrl), primaryCloudApiKey);
    }

    let allCloudKeysQuotaLimited = false;
    if (result.backend === "cloud" && result.kind === "response" && result.response && RETRYABLE_CLOUD_STATUS.has(result.response.status)) {
      const remaining = cloudApiKeys.slice(1); let quotaAttempts = result.response.status === 429 ? 1 : 0; let attempts = 1; const firstStatus = result.response.status;
      if (!remaining.length) allCloudKeysQuotaLimited = result.response.status === 429;
      for (const nextKey of remaining) {
        const next = await this.proxyToBackend("cloud", request, bodyBuffer, this.backendUrl("cloud", originalUrl, selfHostedBaseUrl), nextKey); attempts++;
        if (next.kind === "response" && next.response?.status === 429) quotaAttempts++;
        if (next.kind === "response" && next.response && !RETRYABLE_CLOUD_STATUS.has(next.response.status)) { fallbackUsed = true; fallbackReason = `primary cloud key failed with ${firstStatus}, next key succeeded`; result = next; break; }
        result = next;
      }
      allCloudKeysQuotaLimited = quotaAttempts === attempts && attempts === cloudApiKeys.length;
    }
    if (allCloudKeysQuotaLimited && result.backend === "cloud" && result.kind === "response" && result.response?.status === 429 && isCloudQuotaFallbackAllowed(routeMode, needsCloud)) {
      fallbackUsed = true; fallbackReason = `all ${cloudApiKeys.length} cloud API key(s) returned 429; falling back to self-hosted`;
      result = await this.proxyToBackend("self-hosted", request, bodyBuffer, this.backendUrl("self-hosted", originalUrl, selfHostedBaseUrl));
    }
    const status = result.kind === "network-error" ? 502 : result.response?.status || 502;
    const auditPromise = appendAuditEntry(result.backend, status, fallbackUsed, fallbackReason || needsCloud.reason || "").catch(() => undefined);
    try {
      await this.sendProxyResponse(reply, result, { fallbackUsed, fallbackReason });
    } finally {
      await auditPromise;
    }
  }

  private configDefaultRouteMode(): RouteMode { return "cloud-first"; }

  private getBodyBuffer(request: RequestWithContext): Buffer {
    if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
    if (typeof request.rawBody === "string") return Buffer.from(request.rawBody);
    if (request.body === undefined || request.body === null) return Buffer.alloc(0);
    return Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === "string" ? request.body : JSON.stringify(request.body));
  }

  private privacyHeaders(request: RequestWithContext) {
    if (!this.config.authEnabled) return request.headers;
    return Object.fromEntries(Object.entries(request.headers).filter(([key]) => key.toLowerCase() !== "authorization"));
  }

  private backendUrl(backend: string, originalUrl: string, selfHostedBaseUrl: string): string {
    const base = backend === "cloud" ? this.config.cloudBaseUrl : selfHostedBaseUrl;
    return `${base}${originalUrl}`;
  }

  private sanitizeHeaders(headers: RequestWithContext["headers"], backend: string, apiKey?: string): Record<string, string> {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase(); if (hopByHopHeaders.has(lower) || lower === "x-firecrawl-route-mode") continue;
      if (lower === "authorization" && backend !== "cloud" && this.config.authEnabled) continue;
      if (value !== undefined) next[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    if (backend === "cloud" && apiKey) next.authorization = `Bearer ${apiKey}`;
    return next;
  }

  private async proxyToBackend(backend: string, request: RequestWithContext, bodyBuffer: Buffer, targetUrl: string, apiKey?: string): Promise<ProxyResult> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs); const started = Date.now(); let streaming = false;
    try {
      const response = await fetch(targetUrl, { method: request.method, headers: this.sanitizeHeaders(request.headers, backend, apiKey), body: request.method === "GET" || request.method === "HEAD" ? undefined : bodyBuffer as unknown as BodyInit, redirect: "manual", signal: controller.signal });
      if ((response.ok || response.status < 400) && response.body) { streaming = true; return { kind: "response", backend, response, stream: response.body, cleanup: () => clearTimeout(timeout), durationMs: Date.now() - started }; }
      return { kind: "response", backend, response, body: Buffer.from(await response.arrayBuffer()), durationMs: Date.now() - started };
    } catch (error) {
      return { kind: "network-error", backend, error: error as Error, body: Buffer.from(JSON.stringify({ success: false, error: (error as Error).name === "AbortError" ? "Gateway upstream timeout" : (error as Error).message })), durationMs: Date.now() - started };
    } finally { if (!streaming) clearTimeout(timeout); }
  }

  private async sendProxyResponse(reply: FastifyReply, result: ProxyResult, meta: { fallbackUsed: boolean; fallbackReason: string }): Promise<void> {
    if (result.kind === "network-error") { reply.code(502).headers({ "content-type": "application/json; charset=utf-8", "x-hybrid-firecrawl-backend": result.backend, "x-hybrid-firecrawl-fallback": String(meta.fallbackUsed), "x-hybrid-firecrawl-fallback-reason": meta.fallbackReason }); reply.send(result.body); return; }
    const headers: Record<string, string> = {};
    result.response?.headers.forEach((value, key) => { const lower = key.toLowerCase(); if (hopByHopHeaders.has(lower) || (!result.stream && lower === "content-encoding")) return; headers[key] = value; });
    headers["x-hybrid-firecrawl-backend"] = result.backend; headers["x-hybrid-firecrawl-fallback"] = String(meta.fallbackUsed); if (meta.fallbackReason) headers["x-hybrid-firecrawl-fallback-reason"] = meta.fallbackReason;
    if (!result.stream && result.body) headers["content-length"] = String(result.body.length);
    if (result.stream) {
      reply.hijack(); reply.raw.writeHead(result.response?.status || 502, headers);
      try { await new Promise<void>((resolve, reject) => Readable.fromWeb(result.stream as any).once("error", reject).once("end", resolve).pipe(reply.raw).once("close", resolve).once("error", reject)); }
      finally { result.cleanup?.(); }
      return;
    }
    reply.code(result.response?.status || 502).headers(headers).send(result.body);
  }

  private async getCloudApiKeys(): Promise<string[]> {
    try {
      const record = await this.settings.getSetting("firecrawl_api_keys"); if (!record?.value) return [];
      const decrypted = decryptSettingValue(record.value, this.config.firecrawlKeysEncryptionKey);
      if (!decrypted.encrypted) await this.settings.setSetting(record.key, encryptSettingValue(record.value, this.config.firecrawlKeysEncryptionKey));
      const parsed = JSON.parse(decrypted.value) as unknown; const keys = Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
      const credits = await Promise.all(keys.map(async (key) => ({ key, remainingCredits: await this.getRemainingCredits(key) })));
      return shuffleArray(credits).sort((a, b) => (b.remainingCredits ?? Number.NEGATIVE_INFINITY) - (a.remainingCredits ?? Number.NEGATIVE_INFINITY)).map(({ key }) => key);
    } catch { return []; }
  }

  private async getRemainingCredits(apiKey: string): Promise<number | null> {
    const cached = creditUsageCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) return cached.remainingCredits;
    if (cached) {
      void this.refreshRemainingCredits(apiKey);
      return cached.remainingCredits;
    }
    return this.refreshRemainingCredits(apiKey);
  }

  private async refreshRemainingCredits(apiKey: string): Promise<number | null> {
    const existing = creditUsageInFlight.get(apiKey);
    if (existing) return existing;
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(`${this.config.cloudBaseUrl}/v2/team/credit-usage`, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
        if (!response.ok) return null;
        const json = await response.json() as { data?: { remainingCredits?: number } };
        const remaining = json.data?.remainingCredits;
        if (typeof remaining !== "number") return null;
        creditUsageCache.set(apiKey, { remainingCredits: remaining, expiresAt: Date.now() + CREDIT_USAGE_CACHE_TTL_MS });
        return remaining;
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    })();
    creditUsageInFlight.set(apiKey, request);
    try { return await request; }
    finally { if (creditUsageInFlight.get(apiKey) === request) creditUsageInFlight.delete(apiKey); }
  }
}
