import type { AuditEntry } from "./types";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { rootLogger } from "./logger";

export type DeleteFilter = "today" | "week" | "month" | "all";

export interface AuditStore {
  appendAudit(entry: AuditEntry): Promise<void>;
  readAuditEntries(limit?: number): Promise<AuditEntry[]>;
  deleteAuditEntries(filter: DeleteFilter): Promise<number>;
}

/** Read the last N lines from a file efficiently (tail-read).
 *  Accumulates chunks as raw Buffers and decodes once to avoid UTF-8
 *  boundary corruption and uninitialized-buffer leaks. */
async function readLastLines(filePath: string, lineCount: number): Promise<string[]> {
  if (lineCount <= 0) return [];
  const CHUNK_SIZE = 8192;
  let fileHandle: fs.FileHandle | undefined;
  try {
    fileHandle = await fs.open(filePath, "r");
    const stats = await fileHandle.stat();
    const size = stats.size;
    if (size === 0) return [];

    const chunks: Buffer[] = [];
    let position = size;
    let totalNewlines = 0;

    while (position > 0 && totalNewlines <= lineCount) {
      const chunkSize = Math.min(CHUNK_SIZE, position);
      position -= chunkSize;
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, position);
      if (bytesRead === 0) break;

      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);

      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0x0a) totalNewlines++;
      }
    }

    const text = Buffer.concat(chunks).toString("utf8");
    return text.split("\n").filter(Boolean).slice(-lineCount);
  } finally {
    await fileHandle?.close();
  }
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
      const lines = await readLastLines(logFile, limit);
      return lines
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
    const exists = await fs.access(logFile).then(() => true).catch(() => false);
    if (!exists) return 0;

    let deleted = 0;
    const kept: string[] = [];

    const stream = createReadStream(logFile, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
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
