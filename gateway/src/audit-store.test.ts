import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { withClient } from "./db";
import { createAuditStore } from "./audit-store";

vi.mock("./db", () => ({ withClient: vi.fn() }));
import type { AuditEntry } from "./types";

const entry: AuditEntry = {
  id: "audit-write-failure",
  created_at: "2026-06-30T00:00:00.000Z",
  method: "POST",
  path: "/v2/scrape",
  route_mode: "cloud-first",
  backend_used: "cloud",
  fallback_used: false,
  fallback_reason: "",
  status_code: 200,
  duration_ms: 10,
  target_url: "",
};

describe("createAuditStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists audit entries to the database when enabled", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);

    const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });

    await store.appendAudit(entry);
    await store.flush?.();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      expect.arrayContaining([entry.id, entry.created_at, entry.status_code]),
    );
  });

  it("persists queued entries in database batches", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 100 });
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);

    const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });
    for (let index = 0; index < 101; index++) {
      void store.appendAudit({ ...entry, id: `audit-${index}` });
    }
    await store.flush?.();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => (call[1] as unknown[]).length).sort((a, b) => a - b))
      .toEqual([13, 100 * 13]);
  });

  it("falls back to individual database writes when a batch fails", async () => {
    const query = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("batch constraint failure"), { code: "23503" }))
      .mockResolvedValue({ rowCount: 1 });
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);

    const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });
    void store.appendAudit(entry);
    void store.appendAudit({ ...entry, id: "audit-second" });
    await store.flush?.();

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.slice(1).every((call) => (call[1] as unknown[]).length === 13)).toBe(true);
  });

  it("does not amplify transient database failures with individual retries", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);

    const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });
    for (let index = 0; index < 101; index++) {
      void store.appendAudit({ ...entry, id: `audit-transient-${index}` });
    }
    await store.flush?.();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => (call[1] as unknown[]).length).sort((a, b) => a - b))
      .toEqual([13, 100 * 13]);
  });

  it("uses UTC calendar boundaries when deleting database entries", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);

    const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });

    await store.deleteAuditEntries("today");

    expect(query).toHaveBeenCalledWith(expect.stringContaining("AT TIME ZONE 'UTC'"));
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("NOW() - $1::interval"),
      expect.anything(),
    );
  });

  it("reports database deletions when the JSONL file is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 3 });
    vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
    vi.spyOn(fs, "access").mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const store = createAuditStore("/tmp/missing-audit.jsonl", { persistToDatabase: true });

    await expect(store.deleteAuditEntries("today")).resolves.toBe(3);
  });

  it("logs when an audit entry cannot be persisted without blocking the request", async () => {
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockRejectedValue(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    const store = createAuditStore("/data/hybrid-firecrawl-requests.jsonl");

    await expect(store.appendAudit(entry)).resolves.toBeUndefined();
    await expect(store.flush!()).resolves.toBeUndefined();
  });

  it("times out and discards queued database audits", async () => {
    vi.useFakeTimers();
    try {
      const firstQuery = new Promise<{ rowCount: number }>(() => {});
      const query = vi.fn().mockReturnValue(firstQuery);
      vi.mocked(withClient).mockImplementation(async (fn) => fn({ query } as never));
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);

      const store = createAuditStore("/tmp/audit.jsonl", { persistToDatabase: true });
      await store.appendAudit(entry);
      await store.appendAudit({ ...entry, id: "queued-after-first" });

      const flushPromise = store.flush!(10);
      await vi.advanceTimersByTimeAsync(10);
      await flushPromise;

      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
