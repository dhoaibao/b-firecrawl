import type { Request, Response } from "express";
import type { AuditStore } from "./audit-store";
import type { GatewayConfig, ProxyResult, AuditEntry } from "./types";
import {
  chooseInitialBackend,
  getRouteMode,
  hasSensitiveHeaders,
  isFallbackAllowed,
  isFallbackEligible,
  requestNeedsCloud,
} from "./policy";
import {
  collectTargetUrls,
  cryptoRandomId,
  hasPrivateTargetUrl,
  inspectBody,
  nowIso,
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

async function getFallbackCloudApiKeys(): Promise<string[]> {
  try {
    const record = await settingsService.getSetting("fallback_firecrawl_api_keys");
    if (record?.value) {
      const parsed = JSON.parse(record.value) as string[];
      return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string" && k.length > 0) : [];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
  backend: string,
  config: GatewayConfig,
  apiKey?: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "x-firecrawl-route-mode") continue;
    // Strip the virtual API key before forwarding; only send auth to cloud
    if (lower === "authorization" && backend !== "cloud") continue;
    if (value === undefined) continue;
    next[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  const cloudKey = apiKey || config.cloudApiKey;
  if (backend === "cloud" && cloudKey) {
    next.authorization = `Bearer ${cloudKey}`;
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
      headers: sanitizeHeaders(req.headers, backend, config, apiKey),
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
    const parsedUrl = new URL(requestUrl, "http://gateway.local");
    const routeMode = getRouteMode(
      requestUrl,
      req.headers,
      config.defaultRouteMode,
    );

    // Validate virtual API key when auth is enabled
    let userId: string | undefined;
    if (config.authEnabled) {
      const authHeader = String(req.headers.authorization || "");
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        res.status(401).json({ success: false, error: "Missing or invalid API key" });
        return;
      }
      const apiKey = match[1];
      const validKey = await apiKeyService.validateApiKey(apiKey);
      if (!validKey) {
        res.status(401).json({ success: false, error: "Invalid or revoked API key" });
        return;
      }

      const keyOwner = await userService.getUserById(validKey.user_id);
      if (!keyOwner) {
        res.status(401).json({ success: false, error: "API key owner not found" });
        return;
      }
      const access = userService.checkUserAccess(keyOwner);
      if (!access.allowed) {
        res.status(403).json({ success: false, error: access.reason });
        return;
      }

      userId = validKey.user_id;
      apiKeyService.touchApiKey(validKey.id).catch((err) => {
        log.warn({ err }, "Failed to update API key last used timestamp");
      });
    }

    const bodyBuffer = await readRequestBody(req, config.maxBodyBytes);
    const { json, parseError } = inspectBody(bodyBuffer, req.headers);
    if (parseError) {
      res.status(400).json({ success: false, error: "Invalid JSON body", details: parseError });
      return;
    }
    const targetUrls = collectTargetUrls(json);
    const primaryTargetUrl = targetUrls[0] || "";
    const privacy = {
      hasSensitiveHeaders: hasSensitiveHeaders(req.headers, json),
      hasPrivateTargetUrl: hasPrivateTargetUrl(targetUrls),
    };
    const needsCloud = requestNeedsCloud(parsedUrl.pathname, json);
    const initialBackend = chooseInitialBackend(routeMode, needsCloud);

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
      const auditEntry: AuditEntry = {
        id: cryptoRandomId(),
        created_at: nowIso(),
        method: req.method,
        path: parsedUrl.pathname,
        route_mode: routeMode,
        backend_used: "none",
        fallback_used: false,
        fallback_reason: needsCloud.reason,
        status_code: statusCode,
        duration_ms: Date.now() - started,
        target_url: primaryTargetUrl,
        user_id: userId,
        request_id: req.requestId,
      };
      await auditStore.appendAudit(auditEntry);
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
      });
    }

    // Try fallback cloud API keys on auth/rate-limit errors
    if (
      result.backend === "cloud" &&
      result.kind === "response" &&
      result.response &&
      RETRYABLE_CLOUD_STATUS.has(result.response.status)
    ) {
      const fallbackKeys = await getFallbackCloudApiKeys();
      if (fallbackKeys.length > 0) {
        log.warn(
          { status: result.response.status, fallback_keys: fallbackKeys.length },
          "cloud returned retryable status, trying fallback keys",
        );
        for (const fallbackKey of fallbackKeys) {
          const fallbackResult = await proxyToBackend({
            backend: "cloud",
            req,
            bodyBuffer,
            targetUrl: backendUrl("cloud", requestUrl, config),
            config,
            apiKey: fallbackKey,
          });
          if (
            fallbackResult.kind === "response" &&
            fallbackResult.response &&
            !RETRYABLE_CLOUD_STATUS.has(fallbackResult.response.status)
          ) {
            fallbackUsed = true;
            fallbackReason = `primary cloud key failed with ${result.response.status}, fallback succeeded`;
            result = fallbackResult;
            break;
          }
        }
      }
    }

    const statusCode =
      result.kind === "network-error" ? 502 : result.response?.status || 502;
    const auditEntry: AuditEntry = {
      id: cryptoRandomId(),
      created_at: nowIso(),
      method: req.method,
      path: parsedUrl.pathname,
      route_mode: routeMode,
      backend_used: result.backend,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason || needsCloud.reason || "",
      status_code: statusCode,
      duration_ms: Date.now() - started,
      target_url: primaryTargetUrl,
      user_id: userId,
      request_id: req.requestId,
    };
    await auditStore.appendAudit(auditEntry);

    sendProxyResponse(res, result, { fallbackUsed, fallbackReason });
  };
}
