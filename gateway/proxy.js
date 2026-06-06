const {
  chooseInitialBackend,
  getRouteMode,
  hasSensitiveHeaders,
  isFallbackAllowed,
  isFallbackEligible,
  requestNeedsCloud,
} = require("./policy");
const {
  collectTargetUrls,
  cryptoRandomId,
  hasPrivateTargetUrl,
  inspectBody,
  nowIso,
  writeJson,
} = require("./utils");

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

function sanitizeHeaders(headers, backend, config) {
  const next = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "x-firecrawl-route-mode") continue;
    if (lower === "x-firecrawl-allow-cloud-fallback") continue;
    if (value === undefined) continue;
    next[key] = value;
  }

  if (backend === "cloud" && config.cloudApiKey) {
    next.authorization = `Bearer ${config.cloudApiKey}`;
  }

  return next;
}

async function readRequestBody(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("Request body is too large for gateway inspection");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyToBackend({ backend, req, bodyBuffer, targetUrl, config }) {
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
      error,
      body: Buffer.from(
        JSON.stringify({
          success: false,
          error:
            error.name === "AbortError"
              ? "Gateway upstream timeout"
              : error.message,
        }),
      ),
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function backendUrl(backend, originalUrl, config) {
  const base = backend === "cloud" ? config.cloudBaseUrl : config.localBaseUrl;
  return `${base}${originalUrl}`;
}

function sendProxyResponse(res, result, meta) {
  if (result.kind === "network-error") {
    res.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      "x-hybrid-firecrawl-backend": result.backend,
      "x-hybrid-firecrawl-fallback": String(meta.fallbackUsed),
      "x-hybrid-firecrawl-fallback-reason": meta.fallbackReason || "",
    });
    res.end(result.body);
    return;
  }

  const headers = {};
  for (const [key, value] of result.response.headers.entries()) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === "content-encoding") continue;
    headers[key] = value;
  }
  headers["x-hybrid-firecrawl-backend"] = result.backend;
  headers["x-hybrid-firecrawl-fallback"] = String(meta.fallbackUsed);
  if (meta.fallbackReason) {
    headers["x-hybrid-firecrawl-fallback-reason"] = meta.fallbackReason;
  }
  headers["content-length"] = result.body.length;

  res.writeHead(result.response.status, headers);
  res.end(result.body);
}

function createProxyHandler({ config, auditStore }) {
  return async function handleProxy(req, res) {
    const started = Date.now();
    const parsedUrl = new URL(req.url, "http://gateway.local");
    const routeMode = getRouteMode(
      req.url,
      req.headers,
      config.defaultRouteMode,
    );
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
      await auditStore.appendAudit({
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
      });
      writeJson(res, statusCode, {
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
      targetUrl: backendUrl(initialBackend, req.url, config),
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
          : `local returned ${result.response.status}`;
      result = await proxyToBackend({
        backend: "cloud",
        req,
        bodyBuffer,
        targetUrl: backendUrl("cloud", req.url, config),
        config,
      });
    }

    const statusCode =
      result.kind === "network-error" ? 502 : result.response.status;
    await auditStore.appendAudit({
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
    });

    sendProxyResponse(res, result, { fallbackUsed, fallbackReason });
  };
}

module.exports = { createProxyHandler };
