import type { NeedsCloudResult } from "./types";
import { findObjectsByKey, walk } from "./utils";

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

export function getRouteMode(
  reqUrl: string,
  headers: Record<string, string | string[] | undefined>,
  defaultRouteMode: string,
): string {
  const headerMode = String(headers["x-firecrawl-route-mode"] || "").trim();
  if (validRouteModes.has(headerMode)) return headerMode;

  const parsed = new URL(reqUrl, "http://gateway.local");
  const queryMode = parsed.searchParams.get("routeMode");
  if (queryMode && validRouteModes.has(queryMode)) return queryMode;

  return validRouteModes.has(defaultRouteMode) ? defaultRouteMode : "local-first";
}

export function hasSensitiveHeaders(
  headers: Record<string, string | string[] | undefined>,
  jsonBody: unknown,
): boolean {
  if (headers.authorization || headers.cookie) return true;

  const bodyHeaders = findObjectsByKey(jsonBody, "headers");
  for (const item of bodyHeaders) {
    if (!item || typeof item !== "object") continue;
    for (const key of Object.keys(item as Record<string, unknown>)) {
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

export function requestNeedsCloud(
  pathname: string,
  jsonBody: unknown,
): NeedsCloudResult {
  for (const pattern of cloudOnlyPathPatterns) {
    if (pattern.test(pathname)) {
      return {
        required: true,
        reason: "path requires a Firecrawl Cloud managed feature",
      };
    }
  }

  let reason: string | null = null;
  walk(jsonBody, (value: unknown) => {
    if (reason || !value || typeof value !== "object") return;

    if (Array.isArray((value as Record<string, unknown>).actions) && ((value as Record<string, unknown[]>).actions).length > 0) {
      reason = "actions require Fire-engine-backed Cloud behavior";
      return;
    }

    if ((value as Record<string, unknown>).agent) {
      reason = "agent extraction is Cloud-managed";
      return;
    }

    const formats = Array.isArray((value as Record<string, unknown>).formats)
      ? (value as Record<string, unknown[]>).formats
      : [];
    for (const format of formats) {
      const type =
        typeof format === "string"
          ? format
          : format && typeof format === "object"
            ? (format as Record<string, string>).type
            : "";
      if (cloudOnlyFormatTypes.has(type)) {
        reason = `${type} format is not supported by default self-host`;
        return;
      }
    }

    const proxy = (value as Record<string, unknown>).proxy;
    if (proxy === "stealth" || proxy === "enhanced") {
      reason = "stealth/enhanced proxy requires Cloud-managed behavior";
    }
  });

  return { required: Boolean(reason), reason: reason || "" };
}

export function chooseInitialBackend(
  routeMode: string,
  needsCloud: NeedsCloudResult,
): string {
  if (routeMode === "cloud-first") return "cloud";
  if (routeMode === "local-only") return needsCloud.required ? "reject" : "local";
  return needsCloud.required ? "cloud" : "local";
}

export function isFallbackAllowed(
  routeMode: string,
  privacy: { hasSensitiveHeaders: boolean; hasPrivateTargetUrl: boolean },
): boolean {
  if (routeMode !== "local-first") return false;
  if (privacy.hasSensitiveHeaders) return false;
  if (privacy.hasPrivateTargetUrl) return false;
  return true;
}

export function isFallbackEligible(result: {
  kind: string;
  response?: Response;
  body?: Buffer;
}): boolean {
  if (result.kind === "network-error") return true;
  if (!result.response) return false;
  if (result.response.status >= 500) return true;

  const text = result.body?.toString("utf8").toLowerCase() || "";
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
