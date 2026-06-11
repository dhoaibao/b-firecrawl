import { withClient } from "../db";

export interface SettingRecord {
  key: string;
  value: string;
  updated_at: string;
}

export async function getSetting(key: string): Promise<SettingRecord | null> {
  return withClient(async (client) => {
    const result = await client.query<SettingRecord>(
      "SELECT key, value, updated_at FROM settings WHERE key = $1",
      [key],
    );
    return result.rows[0] || null;
  });
}

export async function listSettings(): Promise<SettingRecord[]> {
  return withClient(async (client) => {
    const result = await client.query<SettingRecord>(
      "SELECT key, value, updated_at FROM settings ORDER BY key",
    );
    return result.rows;
  });
}

export async function setSetting(
  key: string,
  value: string,
): Promise<SettingRecord> {
  return withClient(async (client) => {
    const result = await client.query<SettingRecord>(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING key, value, updated_at`,
      [key, value],
    );
    return result.rows[0];
  });
}

export async function deleteSetting(key: string): Promise<boolean> {
  return withClient(async (client) => {
    const result = await client.query(
      "DELETE FROM settings WHERE key = $1",
      [key],
    );
    return result.rowCount !== null && result.rowCount > 0;
  });
}
