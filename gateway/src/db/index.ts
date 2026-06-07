import { Pool, type PoolClient } from "pg";
import fs from "node:fs/promises";
import path from "node:path";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database pool not initialized. Call initDatabase first.");
  }
  return pool;
}

export async function initDatabase(databaseUrl: string): Promise<Pool> {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
  });

  await runMigrations();
  return pool;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  await withClient(async (client) => {
    await client.query(schema);
  });
}
