import type { GatewayConfig } from "./types";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const config: GatewayConfig = {
  port: Number(process.env.PORT || 8080),
  localBaseUrl: stripTrailingSlash(
    process.env.LOCAL_FIRECRAWL_URL || "http://api:3002",
  ),
  cloudBaseUrl: stripTrailingSlash(
    process.env.FIRECRAWL_CLOUD_URL || "https://api.firecrawl.dev",
  ),
  cloudApiKey: process.env.FIRECRAWL_API_KEY || "",
  defaultRouteMode: process.env.DEFAULT_ROUTE_MODE || "local-first",
  requestTimeoutMs: Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS || 120000),
  logFile:
    process.env.GATEWAY_LOG_FILE || "/data/hybrid-firecrawl-requests.jsonl",
  maxBodyBytes: Number(process.env.GATEWAY_MAX_BODY_BYTES || 5242880),
};
