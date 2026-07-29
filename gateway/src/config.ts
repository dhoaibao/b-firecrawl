import { z } from "zod";
import type { GatewayConfig } from "./types";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const GatewayConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(8080),
  localBaseUrl: z
    .string()
    .min(1, "LOCAL_FIRECRAWL_URL is required")
    .transform(stripTrailingSlash),
  cloudBaseUrl: z
    .string()
    .min(1)
    .default("https://api.firecrawl.dev")
    .transform(stripTrailingSlash),
  defaultRouteMode: z
    .enum(["local-first", "local-only", "cloud-first", "cloud-only"])
    .default("local-first"),
  requestTimeoutMs: z.coerce.number().int().positive().default(120_000),
  logFile: z
    .string()
    .min(1)
    .default("/data/hybrid-firecrawl-requests.jsonl"),
  maxBodyBytes: z.coerce.number().int().positive().default(5_242_880),
  authEnabled: z.preprocess(
    (val) => {
      if (val === undefined) return true;
      const s = String(val).toLowerCase().trim();
      if (s === "" || s === "false" || s === "0" || s === "no" || s === "off") {
        return false;
      }
      if (s === "true" || s === "1" || s === "yes" || s === "on") {
        return true;
      }
      return val;
    },
    z.boolean(),
  ),
  databaseUrl: z.string().min(1, "DATABASE_URL is required"),
  sessionSecret: z.string().default(""),
  firecrawlKeysEncryptionKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be a 64-character hex string"),
  adminEmail: z.string().default(""),
  adminPassword: z.string().default(""),
  trustProxy: z.preprocess(
    (val) => {
      if (val === undefined) return false;
      const s = String(val).toLowerCase().trim();
      if (s === "" || s === "false" || s === "0" || s === "no" || s === "off") {
        return false;
      }
      if (s === "true" || s === "1" || s === "yes" || s === "on") {
        return true;
      }
      return val;
    },
    z.boolean().or(z.string()).default(false),
  ),
});

function loadConfig(): GatewayConfig {
  try {
    const parsed = GatewayConfigSchema.parse({
      port: process.env.PORT,
      localBaseUrl: process.env.LOCAL_FIRECRAWL_URL,
      cloudBaseUrl: process.env.FIRECRAWL_CLOUD_URL,
      defaultRouteMode: process.env.DEFAULT_ROUTE_MODE,
      requestTimeoutMs: process.env.GATEWAY_REQUEST_TIMEOUT_MS,
      logFile: process.env.GATEWAY_LOG_FILE,
      maxBodyBytes: process.env.GATEWAY_MAX_BODY_BYTES,
      authEnabled: process.env.AUTH_ENABLED,
      databaseUrl: process.env.DATABASE_URL,
      sessionSecret: process.env.SESSION_SECRET,
      firecrawlKeysEncryptionKey: process.env.FIRECRAWL_KEYS_ENCRYPTION_KEY,
      adminEmail: process.env.ADMIN_EMAIL,
      adminPassword: process.env.ADMIN_PASSWORD,
      trustProxy: process.env.TRUST_PROXY,
    });

    if (!parsed.sessionSecret && process.env.NODE_ENV === "production") {
      console.warn(
        "Warning: SESSION_SECRET is empty in production. Sessions may be insecure.",
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      console.error(`Configuration error:\n${issues}`);
    } else {
      console.error("Configuration error:", error);
    }
    process.exit(1);
  }
}

export const config: GatewayConfig = loadConfig();
