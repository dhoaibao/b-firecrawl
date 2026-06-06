import type { AuditEntry } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

export interface AuditStore {
  appendAudit(entry: AuditEntry): Promise<void>;
  readAuditEntries(limit?: number): Promise<AuditEntry[]>;
}

export function createAuditStore(logFile: string): AuditStore {
  async function appendAudit(entry: AuditEntry): Promise<void> {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf8");
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

  return { appendAudit, readAuditEntries };
}
