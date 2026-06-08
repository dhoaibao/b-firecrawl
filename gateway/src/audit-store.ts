import type { AuditEntry } from "./types";
import fs from "node:fs/promises";
import path from "node:path";
import { rootLogger } from "./logger";

export type DeleteFilter = "today" | "week" | "month" | "all";

export interface AuditStore {
  appendAudit(entry: AuditEntry): Promise<void>;
  readAuditEntries(limit?: number): Promise<AuditEntry[]>;
  deleteAuditEntries(filter: DeleteFilter): Promise<number>;
}

export function createAuditStore(logFile: string): AuditStore {
  async function appendAudit(entry: AuditEntry): Promise<void> {
    try {
      await fs.mkdir(path.dirname(logFile), { recursive: true });
      await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      rootLogger.error({ err, entry }, "Failed to write audit entry");
    }
  }

  async function readAuditEntries(limit = 250): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(logFile, "utf8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map((line) => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((item): item is AuditEntry => item !== null)
        .reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async function deleteAuditEntries(filter: DeleteFilter): Promise<number> {
    if (filter === "all") {
      try {
        await fs.writeFile(logFile, "", "utf8");
        return -1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
        throw error;
      }
    }

    const now = new Date();
    const content = await fs.readFile(logFile, "utf8").catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw err;
    });
    if (!content.trim()) return 0;

    const lines = content.trim().split("\n").filter(Boolean);
    let deleted = 0;
    const kept: string[] = [];

    for (const line of lines) {
      let entry: AuditEntry | null = null;
      try {
        entry = JSON.parse(line) as AuditEntry;
      } catch {
        kept.push(line);
        continue;
      }

      const entryDate = new Date(entry.created_at);
      let shouldDelete = false;

      if (filter === "today") {
        shouldDelete =
          entryDate.getDate() === now.getDate() &&
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear();
      } else if (filter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        weekAgo.setHours(0, 0, 0, 0);
        shouldDelete = entryDate >= weekAgo;
      } else if (filter === "month") {
        shouldDelete =
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear();
      }

      if (shouldDelete) {
        deleted++;
      } else {
        kept.push(line);
      }
    }

    await fs.writeFile(logFile, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf8");
    return deleted;
  }

  return { appendAudit, readAuditEntries, deleteAuditEntries };
}
