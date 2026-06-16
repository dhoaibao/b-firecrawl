import crypto from "node:crypto";
import { withClient } from "../db";
import type { ApiKey } from "../types";

export interface CreatedApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  revoked: boolean;
  created_at: string;
  updated_at: string;
  key: string; // plain key, shown only once
}

export async function createApiKey(userId: string, name: string): Promise<CreatedApiKey> {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 8);

  return withClient(async (client) => {
    const result = await client.query<ApiKey>(
      `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, revoked)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [crypto.randomUUID(), userId, name, keyHash, keyPrefix],
    );
    const row = result.rows[0];
    return {
      ...row,
      key,
    };
  });
}

export async function listApiKeys(userId?: string): Promise<ApiKey[]> {
  return withClient(async (client) => {
    const query = userId
      ? "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
      : "SELECT * FROM api_keys ORDER BY created_at DESC";
    const params = userId ? [userId] : [];
    const result = await client.query<ApiKey>(query, params);
    return result.rows;
  });
}

export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  return withClient(async (client) => {
    const result = await client.query<ApiKey>(
      "SELECT * FROM api_keys WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  });
}

export async function revokeApiKey(id: string): Promise<ApiKey | null> {
  return withClient(async (client) => {
    const result = await client.query<ApiKey>(
      "UPDATE api_keys SET revoked = true, updated_at = NOW() WHERE id = $1 RETURNING *",
      [id],
    );
    return result.rows[0] || null;
  });
}

export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const keyHash = hashApiKey(key);
  return withClient(async (client) => {
    const result = await client.query<ApiKey>(
      "SELECT * FROM api_keys WHERE key_hash = $1 AND revoked = false",
      [keyHash],
    );
    return result.rows[0] || null;
  });
}

const TOUCH_DEBOUNCE_MS = 60_000;
const TOUCH_TRACKER_MAX_SIZE = 10_000;

// Map maintains insertion order, so we can use it as a simple LRU cache:
// deleting and re-inserting a key moves it to the end (most-recent), and the
// first entry is the least-recent when we need to evict.
const lastTouchById = new Map<string, number>();

export function clearTouchDebouncer(): void {
  lastTouchById.clear();
}

function recordTouch(id: string, timestamp: number): void {
  if (lastTouchById.has(id)) {
    lastTouchById.delete(id);
  } else if (lastTouchById.size >= TOUCH_TRACKER_MAX_SIZE) {
    const oldest = lastTouchById.keys().next().value;
    if (oldest !== undefined) {
      lastTouchById.delete(oldest);
    }
  }
  lastTouchById.set(id, timestamp);
}

export async function touchApiKey(id: string): Promise<void> {
  const now = Date.now();
  const lastTouch = lastTouchById.get(id);
  if (lastTouch && now - lastTouch < TOUCH_DEBOUNCE_MS) {
    // Refresh LRU position without touching the database.
    recordTouch(id, lastTouch);
    return;
  }

  await withClient(async (client) => {
    await client.query(
      "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
      [id],
    );
  });

  recordTouch(id, now);
}

function generateApiKey(): string {
  const prefix = "fc_";
  const randomPart = crypto.randomBytes(32).toString("base64url");
  return `${prefix}${randomPart}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
