import { withClient } from "../db";
import type { User } from "../types";

export async function createUser(
  email: string,
  name: string,
  passwordHash: string,
  isAdmin = false,
): Promise<User> {
  return withClient(async (client) => {
    const result = await client.query<User>(
      `INSERT INTO users (id, email, name, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [crypto.randomUUID(), email, name, passwordHash, isAdmin],
    );
    return result.rows[0];
  });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return withClient(async (client) => {
    const result = await client.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    return result.rows[0] || null;
  });
}

export async function getUserById(id: string): Promise<User | null> {
  return withClient(async (client) => {
    const result = await client.query<User>(
      "SELECT * FROM users WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  });
}

export async function listUsers(): Promise<User[]> {
  return withClient(async (client) => {
    const result = await client.query<User>(
      "SELECT * FROM users ORDER BY created_at DESC",
    );
    return result.rows;
  });
}

export async function updateUser(
  id: string,
  updates: { name?: string; email?: string; password_hash?: string; is_admin?: boolean },
): Promise<User | null> {
  return withClient(async (client) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    if (updates.password_hash !== undefined) {
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(updates.password_hash);
    }
    if (updates.is_admin !== undefined) {
      fields.push(`is_admin = $${paramIndex++}`);
      values.push(updates.is_admin);
    }

    if (fields.length === 0) {
      return getUserById(id);
    }

    values.push(id);
    const result = await client.query<User>(
      `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  return withClient(async (client) => {
    const result = await client.query(
      "DELETE FROM users WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function countUsers(): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM users",
    );
    return parseInt(result.rows[0].count, 10);
  });
}
