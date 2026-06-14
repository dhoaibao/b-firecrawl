import { Router } from "express";
import type { GatewayConfig } from "../types";
import * as settingsService from "./service";

const VALID_SETTINGS = [
  "firecrawl_api_key",
  "user_inactivity_suspend_days",
  "api_key_inactivity_revoke_days",
  "fallback_firecrawl_api_keys",
] as const;

const SETTING_TYPES: Record<string, "string" | "number" | "boolean" | "json"> = {
  firecrawl_api_key: "string",
  user_inactivity_suspend_days: "number",
  api_key_inactivity_revoke_days: "number",
  fallback_firecrawl_api_keys: "json",
};

export interface CreditUsageItem {
  keyPrefix: string;
  remainingCredits: number | null;
  planCredits: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  error?: string;
}

export function createSettingsRouter(config: GatewayConfig) {
  const router = Router();

  router.get("/credit-usage", async (_req, res, next) => {
    try {
      const items = await fetchCreditUsage(config.cloudBaseUrl);
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await settingsService.listSettings();
      const settings: Record<string, unknown> = {};
      for (const row of rows) {
        settings[row.key] = parseValue(row.value, SETTING_TYPES[row.key] || "string");
      }
      res.json({ data: settings });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (req, res, next) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== "object") {
        res.status(400).json({ success: false, error: "Expected JSON object with settings" });
        return;
      }

      const result: Record<string, unknown> = {};
      for (const [key, rawValue] of Object.entries(updates)) {
        if (!VALID_SETTINGS.includes(key as typeof VALID_SETTINGS[number])) {
          res.status(400).json({ success: false, error: `Invalid setting key: ${key}` });
          return;
        }

        const type = SETTING_TYPES[key] || "string";
        let value: string;

        if (type === "json") {
          value = JSON.stringify(rawValue);
        } else if (type === "boolean") {
          value = String(rawValue === true || rawValue === "true");
        } else if (type === "number") {
          const num = Number(rawValue);
          if (!Number.isFinite(num) || num < 0) {
            res.status(400).json({ success: false, error: `${key} must be a non-negative number` });
            return;
          }
          value = String(num);
        } else {
          value = String(rawValue);
        }

        await settingsService.setSetting(key, value);
        result[key] = parseValue(value, type);
      }

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseValue(value: string, type: string): unknown {
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "number") {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }
  return value;
}

async function fetchCreditUsage(cloudBaseUrl: string): Promise<CreditUsageItem[]> {
  const primary = await settingsService.getSetting("firecrawl_api_key");
  const primaryKey = primary?.value?.trim() || "";
  const fallbackRecord = await settingsService.getSetting("fallback_firecrawl_api_keys");
  let fallbackKeys: string[] = [];
  try {
    const parsed = fallbackRecord?.value ? (JSON.parse(fallbackRecord.value) as unknown) : [];
    fallbackKeys = Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string" && k.length > 0)
      : [];
  } catch {
    fallbackKeys = [];
  }

  const keys = [...(primaryKey ? [primaryKey] : []), ...fallbackKeys];
  const results: CreditUsageItem[] = [];

  for (const key of keys) {
    results.push(await fetchCreditUsageForKey(cloudBaseUrl, key));
  }

  return results;
}

async function fetchCreditUsageForKey(
  cloudBaseUrl: string,
  apiKey: string,
): Promise<CreditUsageItem> {
  const keyPrefix = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(`${cloudBaseUrl}/v2/team/credit-usage`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      return {
        keyPrefix,
        remainingCredits: null,
        planCredits: null,
        billingPeriodStart: null,
        billingPeriodEnd: null,
        error: `HTTP ${response.status}: ${body || response.statusText}`,
      };
    }

    const json = (await response.json()) as {
      data?: {
        remainingCredits?: number;
        planCredits?: number;
        billingPeriodStart?: string | null;
        billingPeriodEnd?: string | null;
      };
    };

    return {
      keyPrefix,
      remainingCredits: json.data?.remainingCredits ?? null,
      planCredits: json.data?.planCredits ?? null,
      billingPeriodStart: json.data?.billingPeriodStart ?? null,
      billingPeriodEnd: json.data?.billingPeriodEnd ?? null,
    };
  } catch (error) {
    return {
      keyPrefix,
      remainingCredits: null,
      planCredits: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      error: (error as Error).message,
    };
  }
}

