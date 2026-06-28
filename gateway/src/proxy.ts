import type { Request, Response } from "express";
import type { AuditStore } from "./audit-store";
import type { GatewayConfig, ProxyResult, AuditEntry } from "./types";
import {
  chooseInitialBackend,
  getRouteMode,
  hasSensitiveHeaders,
  isFallbackAllowed,
  isFallbackEligible,
  isCloudQuotaFallbackAllowed,
  requestNeedsCloud,
} from "./policy";
import {
  collectTargetUrls,
  cryptoRandomId,
  hasPrivateTargetUrl,
  inspectBody,
  nowIso,
  shuffleArray,
} from "./utils";
import * as apiKeyService from "./api-keys/service";
import * as userService from "./users/service";
import * as settingsService from "./settings/service";
import { getRequestLogger } from "./logger";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function getCloudApiKeys(): Promise<string[]> {
  try {
    const record = await settingsService.getSetting("firecrawl_api_keys");
    if (record?.value) {
      const parsed = JSON.parse(record.value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === "string" && k.length > 0)
        : [];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
  backend: string,
  apiKey?: string,
  authEnabled?: boolean,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "x-firecrawl-route-mode") continue;
    // Strip the virtual API key before forwarding; only send auth to cloud.
    // In auth-disabled mode the Authorization header belongs to the client and
    // must be preserved for the local backend (transparent proxy behavior).
    if (lower === "authorization" && backend !== "cloud" && authEnabled) continue;
    if (value === undefined) continue;
    next[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  if (backend === "cloud" && apiKey) {
    next.authorization = `Bearer ${apiKey}`;
  }

  return next;
}

export function headersForPrivacyCheck(
  headers: Record<string, string | string[] | undefined>,
  authEnabled: boolean,
): Record<string, string | string[] | undefined> {
  if (!authEnabled) return headers;

  const next = { ...headers };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === "authorization") {
      delete next[key];
    }
  }
  return next;
}

async function readRequestBody(req: Request, maxBodyBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("Request body is too large for gateway inspection");
      (error as Error & { statusCode: number }).statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyToBackend({
  backend,
  req,
  bodyBuffer,
  targetUrl,
  config,
  apiKey,
}: {
  backend: string;
  req: Request;
  bodyBuffer: Buffer;
  targetUrl: string;
  config: GatewayConfig;
  apiKey?: string;
}): Promise<ProxyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: sanitizeHeaders(req.headers, backend, apiKey, config.authEnabled),
      body:
        req.method === "GET" || req.method === "HEAD" ? undefined : bodyBuffer,
      redirect: "manual",
      signal: controller.signal,
    });
    const arrayBuffer = await response.arrayBuffer();
    return {
      kind: "response",
      backend,
      response,
      body: Buffer.from(arrayBuffer),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      kind: "network-error",
      backend,
      error: error as Error,
      body: Buffer.from(
        JSON.stringify({
          success: false,
          error:
            (error as Error).name === "AbortError"
              ? "Gateway upstream timeout"
              : (error as Error).message,
        }),
      ),
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function backendUrl(
  backend: string,
  originalUrl: string,
  config: GatewayConfig,
): string {
  const base =
    backend === "cloud" ? config.cloudBaseUrl : config.localBaseUrl;
  return `${base}${originalUrl}`;
}

function sendProxyResponse(
  res: Response,
  result: ProxyResult,
  meta: { fallbackUsed: boolean; fallbackReason: string },
): void {
  if (result.kind === "network-error") {
    res.status(502).set({
      "content-type": "application/json; charset=utf-8",
      "x-hybrid-firecrawl-backend": result.backend,
      "x-hybrid-firecrawl-fallback": String(meta.fallbackUsed),
      "x-hybrid-firecrawl-fallback-reason": meta.fallbackReason || "",
    });
    res.end(result.body);
    return;
  }

  const headers: Record<string, string> = {};
  if (result.response) {
    result.response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (hopByHopHeaders.has(lower)) return;
      if (lower === "content-encoding") return;
      headers[key] = value;
    });
  }
  headers["x-hybrid-firecrawl-backend"] = result.backend;
  headers["x-hybrid-firecrawl-fallback"] = String(meta.fallbackUsed);
  if (meta.fallbackReason) {
    headers["x-hybrid-firecrawl-fallback-reason"] = meta.fallbackReason;
  }
  headers["content-length"] = String(result.body.length);

  res.status(result.response?.status || 502).set(headers);
  res.end(result.body);
}

/** Status codes that suggest trying another cloud API key */
const RETRYABLE_CLOUD_STATUS = new Set([401, 403, 429]);

export function createProxyHandler({
  config,
  auditStore,
}: {
  config: GatewayConfig;
  auditStore: AuditStore;
}) {
  return async function handleProxy(
    req: Request,
    res: Response,
  ): Promise<void> {
    const log = getRequestLogger(req);
    const started = Date.now();
    const requestUrl = req.originalUrl || req.url;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(requestUrl, "http://gateway.local");
    } catch {
      res.status(400).json({ success: false, error: "Invalid request URL" });
      return;
    }
    let userId: string | undefined;
    let primaryTargetUrl = "";
    let routeMode: string = config.defaultRouteMode;
    const appendAuditEntry = async ({
      backendUsed,
      statusCode,
      fallbackUsed = false,
      fallbackReason = "",
    }: {
      backendUsed: string;
      statusCode: number;
      fallbackUsed?: boolean;
      fallbackReason?: string;
    }): Promise<void> => {
      const auditEntry: AuditEntry = {
        id: cryptoRandomId(),
        created_at: nowIso(),
        method: req.method,
        path: parsedUrl.pathname,
        route_mode: routeMode,
        backend_used: backendUsed,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
        status_code: statusCode,
        duration_ms: Date.now() - started,
        target_url: primaryTargetUrl,
        user_id: userId,
        request_id: req.requestId,
      };
      try {
        await auditStore.appendAudit(auditEntry);
      } catch (auditErr) {
        log.warn({ err: auditErr }, "Failed to write audit entry; continuing request");
      }
    };

    const defaultRouteMode = await settingsService.getDefaultRouteMode(config.defaultRouteMode);
    routeMode = getRouteMode(
      requestUrl,
      req.headers,
      defaultRouteMode,
    );

    // Validate virtual API key when auth is enabled
    if (config.authEnabled) {
      const authHeader = String(req.headers.authorization || "");
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        await appendAuditEntry({
          backendUsed: "none",
          statusCode: 401,
          fallbackReason: "Missing or invalid API key",
        });
        res.status(401).json({ success: false, error: "Missing or invalid API key" });
        return;
      }
      const apiKey = match[1];
      const validKey = await apiKeyService.validateApiKey(apiKey);
      if (!validKey) {
        await appendAuditEntry({
          backendUsed: "none",
          statusCode: 401,
          fallbackReason: "Invalid or revoked API key",
        });
        res.status(401).json({ success: false, error: "Invalid or revoked API key" });
        return;
      }

      const keyOwner = await userService.getUserById(validKey.user_id);
      if (!keyOwner) {
        await appendAuditEntry({
          backendUsed: "none",
          statusCode: 401,
          fallbackReason: "API key owner not found",
        });
        res.status(401).json({ success: false, error: "API key owner not found" });
        return;
      }
      const access = userService.checkUserAccess(keyOwner);
      if (!access.allowed) {
        await appendAuditEntry({
          backendUsed: "none",
          statusCode: 403,
          fallbackReason: access.reason,
        });
        res.status(403).json({ success: false, error: access.reason });
        return;
      }

      userId = validKey.user_id;
      apiKeyService.touchApiKey(validKey.id).catch((err) => {
        log.warn({ err }, "Failed to update API key last used timestamp");
      });
    }

    let bodyBuffer: Buffer;
    try {
      bodyBuffer = await readRequestBody(req, config.maxBodyBytes);
    } catch (error) {
      await appendAuditEntry({
        backendUsed: "none",
        statusCode: (error as Error & { statusCode?: number }).statusCode || 500,
        fallbackReason: (error as Error).message || "Gateway error",
      });
      throw error;
    }
    const { json, parseError } = inspectBody(bodyBuffer, req.headers);
    if (parseError) {
      await appendAuditEntry({
        backendUsed: "none",
        statusCode: 400,
        fallbackReason: parseError,
      });
      res.status(400).json({ success: false, error: "Invalid JSON body", details: parseError });
      return;
    }
    const targetUrls = collectTargetUrls(json);
    primaryTargetUrl = targetUrls[0] || "";
    const privacyHeaders = headersForPrivacyCheck(req.headers, config.authEnabled);
    const privacy = {
      hasSensitiveHeaders: hasSensitiveHeaders(privacyHeaders, json),
      hasPrivateTargetUrl: hasPrivateTargetUrl(targetUrls),
    };
    const needsCloud = requestNeedsCloud(parsedUrl.pathname, json);
    const initialBackend = chooseInitialBackend(routeMode, needsCloud);
    const cloudApiKeys = shuffleArray(await getCloudApiKeys());
    const primaryCloudApiKey = cloudApiKeys[0];

    if (initialBackend === "cloud" && !primaryCloudApiKey) {
      const statusCode = 502;
      log.warn(
        { reason: needsCloud.reason },
        "request requires Firecrawl Cloud but no primary API key configured",
      );
      await appendAuditEntry({
        backendUsed: "none",
        statusCode,
        fallbackReason: "No Firecrawl Cloud API key configured",
      });
      res.status(statusCode).json({
        success: false,
        error: "No Firecrawl Cloud API key configured. Add one in Settings.",
      });
      return;
    }

    log.info(
      {
        route_mode: routeMode,
        initial_backend: initialBackend,
        needs_cloud: needsCloud.required,
        needs_cloud_reason: needsCloud.reason || undefined,
      },
      "routing decision",
    );

    if (initialBackend === "reject") {
      const statusCode = 409;
      log.warn(
        { reason: needsCloud.reason },
        "request rejected: requires cloud in local-only mode",
      );
      await appendAuditEntry({
        backendUsed: "none",
        statusCode,
        fallbackReason: needsCloud.reason,
      });
      res.status(statusCode).json({
        success: false,
        error:
          "This request requires Firecrawl Cloud, but route mode is local-only.",
        reason: needsCloud.reason,
      });
      return;
    }

    let result = await proxyToBackend({
      backend: initialBackend,
      req,
      bodyBuffer,
      targetUrl: backendUrl(initialBackend, requestUrl, config),
      config,
      apiKey: initialBackend === "cloud" ? primaryCloudApiKey : undefined,
    });
    let fallbackUsed = false;
    let fallbackReason = "";

    if (
      initialBackend === "local" &&
      isFallbackEligible(result) &&
      isFallbackAllowed(routeMode, privacy)
    ) {
      fallbackUsed = true;
      fallbackReason =
        result.kind === "network-error"
          ? result.error?.message || "local network error"
          : `local returned ${result.response?.status}`;
      log.warn(
        { fallback_reason: fallbackReason },
        "falling back from local to cloud",
      );
      result = await proxyToBackend({
        backend: "cloud",
        req,
        bodyBuffer,
        targetUrl: backendUrl("cloud", requestUrl, config),
        config,
        apiKey: primaryCloudApiKey,
      });
    }

    // Try next cloud API keys on auth/rate-limit errors
    let allCloudKeysQuotaLimited = false;
    if (
      result.backend === "cloud" &&
      result.kind === "response" &&
      result.response &&
      RETRYABLE_CLOUD_STATUS.has(result.response.status)
    ) {
      const remainingKeys = cloudApiKeys.slice(1);
      let quotaLimitedAttempts = result.response.status === 429 ? 1 : 0;
      let totalAttempts = 1;
      const firstCloudStatus = result.response.status;

      if (remainingKeys.length === 0) {
        allCloudKeysQuotaLimited = result.response.status === 429;
      } else {
        log.warn(
          { status: result.response.status, fallback_keys: remainingKeys.length },
          "cloud returned retryable status, trying next keys",
        );
        for (const nextKey of remainingKeys) {
          const fallbackResult = await proxyToBackend({
            backend: "cloud",
            req,
            bodyBuffer,
            targetUrl: backendUrl("cloud", requestUrl, config),
            config,
            apiKey: nextKey,
          });
          totalAttempts += 1;
          if (
            fallbackResult.kind === "response" &&
            fallbackResult.response
          ) {
            if (fallbackResult.response.status === 429) {
              quotaLimitedAttempts += 1;
            }
            if (!RETRYABLE_CLOUD_STATUS.has(fallbackResult.response.status)) {
              fallbackUsed = true;
              fallbackReason = `primary cloud key failed with ${firstCloudStatus}, next key succeeded`;
              result = fallbackResult;
              break;
            }
          }
          result = fallbackResult;
        }
        allCloudKeysQuotaLimited =
          quotaLimitedAttempts === totalAttempts &&
          totalAttempts === cloudApiKeys.length;
      }
    }

    if (
      allCloudKeysQuotaLimited &&
      result.backend === "cloud" &&
      result.kind === "response" &&
      result.response?.status === 429 &&
      isCloudQuotaFallbackAllowed(routeMode, needsCloud)
    ) {
      fallbackUsed = true;
      fallbackReason = `all ${cloudApiKeys.length} cloud API key(s) returned 429; falling back to local`;
      log.warn(
        { fallback_reason: fallbackReason },
        "falling back from cloud to local",
      );
      result = await proxyToBackend({
        backend: "local",
        req,
        bodyBuffer,
        targetUrl: backendUrl("local", requestUrl, config),
        config,
      });
    }

    const statusCode =
      result.kind === "network-error" ? 502 : result.response?.status || 502;
    await appendAuditEntry({
      backendUsed: result.backend,
      statusCode,
      fallbackUsed,
      fallbackReason: fallbackReason || needsCloud.reason || "",
    });
    sendProxyResponse(res, result, { fallbackUsed, fallbackReason });
  };
}
