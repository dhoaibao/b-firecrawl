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

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
  backend: string,
  config: GatewayConfig,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "x-firecrawl-route-mode") continue;
    if (lower === "x-firecrawl-allow-cloud-fallback") continue;
    // Strip the virtual API key before forwarding; only send auth to cloud
    if (lower === "authorization" && backend !== "cloud") continue;
    if (value === undefined) continue;
    next[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  if (backend === "cloud" && config.cloudApiKey) {
    next.authorization = `Bearer ${config.cloudApiKey}`;
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
}: {
  backend: string;
  req: Request;
  bodyBuffer: Buffer;
  targetUrl: string;
  config: GatewayConfig;
}): Promise<ProxyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: sanitizeHeaders(req.headers, backend, config),
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
    const started = Date.now();
    const requestUrl = req.originalUrl || req.url;
    const parsedUrl = new URL(requestUrl, "http://gateway.local");
    const routeMode = getRouteMode(
      requestUrl,
      req.headers,
      config.defaultRouteMode,
    );

    // Validate virtual API key when auth is enabled
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
    }

    const bodyBuffer = await readRequestBody(req, config.maxBodyBytes);
    const { json } = inspectBody(bodyBuffer, req.headers);
    const targetUrls = collectTargetUrls(json);
    const primaryTargetUrl = targetUrls[0] || "";
    const privacy = {
      hasSensitiveHeaders: hasSensitiveHeaders(req.headers, json),
      hasPrivateTargetUrl: hasPrivateTargetUrl(targetUrls),
    };
    const needsCloud = requestNeedsCloud(parsedUrl.pathname, json);
    const initialBackend = chooseInitialBackend(routeMode, needsCloud);

    if (initialBackend === "reject") {
      const statusCode = 409;
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
      result = await proxyToBackend({
        backend: "cloud",
        req,
        bodyBuffer,
        targetUrl: backendUrl("cloud", requestUrl, config),
        config,
      });
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
    };
    await auditStore.appendAudit(auditEntry);

    sendProxyResponse(res, result, { fallbackUsed, fallbackReason });
  };
}
