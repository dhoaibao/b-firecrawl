const { findObjectsByKey, walk } = require("./utils");

const validRouteModes = new Set(["local-first", "local-only", "cloud-first"]);

const cloudOnlyPathPatterns = [
  /^\/v\d+\/agent(?:\/|$)/,
  /^\/v\d+\/browser(?:\/|$)/,
  /^\/v\d+\/monitor(?:\/|$)/,
  /^\/v\d+\/research(?:\/|$)/,
  /^\/v\d+\/scrape\/[^/]+\/interact(?:\/|$)/,
  /^\/v\d+\/search\/[^/]+\/feedback(?:\/|$)/,
];

const cloudOnlyFormatTypes = new Set([
  "screenshot",
  "branding",
  "changeTracking",
]);

function getRouteMode(reqUrl, headers, defaultRouteMode) {
  const headerMode = String(headers["x-firecrawl-route-mode"] || "").trim();
  if (validRouteModes.has(headerMode)) return headerMode;

  const parsed = new URL(reqUrl, "http://gateway.local");
  const queryMode = parsed.searchParams.get("routeMode");
  if (queryMode && validRouteModes.has(queryMode)) return queryMode;

  return validRouteModes.has(defaultRouteMode) ? defaultRouteMode : "local-first";
}

function hasSensitiveHeaders(headers, jsonBody) {
  if (headers.authorization || headers.cookie) return true;

  const bodyHeaders = findObjectsByKey(jsonBody, "headers");
  for (const item of bodyHeaders) {
    if (!item || typeof item !== "object") continue;
    for (const key of Object.keys(item)) {
      const lower = key.toLowerCase();
      if (
        lower === "authorization" ||
        lower === "cookie" ||
        lower === "x-api-key" ||
        lower.includes("token") ||
        lower.includes("secret")
      ) {
        return true;
      }
    }
  }
  return false;
}

function requestNeedsCloud(pathname, jsonBody) {
  for (const pattern of cloudOnlyPathPatterns) {
    if (pattern.test(pathname)) {
      return {
        required: true,
        reason: "path requires a Firecrawl Cloud managed feature",
      };
    }
  }

  let reason = null;
  walk(jsonBody, value => {
    if (reason || !value || typeof value !== "object") return;

    if (Array.isArray(value.actions) && value.actions.length > 0) {
      reason = "actions require Fire-engine-backed Cloud behavior";
      return;
    }

    if (value.agent) {
      reason = "agent extraction is Cloud-managed";
      return;
    }

    const formats = Array.isArray(value.formats) ? value.formats : [];
    for (const format of formats) {
      const type =
        typeof format === "string"
          ? format
          : format && typeof format === "object"
            ? format.type
            : "";
      if (cloudOnlyFormatTypes.has(type)) {
        reason = `${type} format is not supported by default self-host`;
        return;
      }
    }

    const proxy = value.proxy;
    if (proxy === "stealth" || proxy === "enhanced") {
      reason = "stealth/enhanced proxy requires Cloud-managed behavior";
    }
  });

  return { required: Boolean(reason), reason };
}

function chooseInitialBackend(routeMode, needsCloud) {
  if (routeMode === "cloud-first") return "cloud";
  if (routeMode === "local-only") return needsCloud.required ? "reject" : "local";
  return needsCloud.required ? "cloud" : "local";
}

function isFallbackAllowed(routeMode, privacy) {
  if (routeMode !== "local-first") return false;
  if (privacy.hasSensitiveHeaders) return false;
  if (privacy.hasPrivateTargetUrl) return false;
  return true;
}

function isFallbackEligible(result) {
  if (result.kind === "network-error") return true;
  if (!result.response) return false;
  if (result.response.status >= 500) return true;

  const text = result.body.toString("utf8").toLowerCase();
  return (
    result.response.status >= 400 &&
    (text.includes("fire-engine") ||
      text.includes("not configured") ||
      text.includes("not supported") ||
      text.includes("unsupported") ||
      text.includes("actions") ||
      text.includes("screenshot") ||
      text.includes("branding"))
  );
}

module.exports = {
  chooseInitialBackend,
  getRouteMode,
  hasSensitiveHeaders,
  isFallbackAllowed,
  isFallbackEligible,
  requestNeedsCloud,
};
