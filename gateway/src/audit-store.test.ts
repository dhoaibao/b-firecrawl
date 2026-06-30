import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { createAuditStore } from "./audit-store";
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

  it("rejects when an audit entry cannot be persisted", async () => {
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockRejectedValue(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    const store = createAuditStore("/data/hybrid-firecrawl-requests.jsonl");

    await expect(store.appendAudit(entry)).rejects.toMatchObject({ code: "EACCES" });
  });
});
