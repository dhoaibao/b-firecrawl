import { Router } from "express";
import * as settingsService from "./service";

const VALID_SETTINGS = [
  "user_inactivity_suspend_days",
  "api_key_inactivity_revoke_days",
  "fallback_firecrawl_api_keys",
] as const;

const SETTING_TYPES: Record<string, "string" | "number" | "boolean" | "json"> = {
  user_inactivity_suspend_days: "number",
  api_key_inactivity_revoke_days: "number",
  fallback_firecrawl_api_keys: "json",
};

export function createSettingsRouter() {
  const router = Router();

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
