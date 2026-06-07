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

function generateApiKey(): string {
  const prefix = "fc_";
  const randomPart = crypto.randomBytes(32).toString("base64url");
  return `${prefix}${randomPart}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
