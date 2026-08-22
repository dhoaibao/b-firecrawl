import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import type { PrismaService } from "../prisma/prisma.service";

function makeAuditMock() {
  return {
    readAuditEntries: vi.fn().mockResolvedValue([]),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    deleteAuditEntry: vi.fn().mockResolvedValue(true),
    deleteAuditEntriesByIds: vi.fn().mockResolvedValue(0),
    deleteAuditEntries: vi.fn().mockResolvedValue(0),
  };
}

function makeRow(id: string, createdAt: Date) {
  return {
    id,
    createdAt,
    method: "POST",
    path: "/v1/scrape",
    routeMode: "cloud-first",
    backendUsed: "cloud",
    fallbackUsed: false,
    fallbackReason: "",
    statusCode: 200,
    durationMs: 120,
    targetUrl: "https://firecrawl.dev",
    requestId: null,
  };
}

describe("AuditController data", () => {
  it("returns all entries when since is absent", async () => {
    const audit = makeAuditMock();
    audit.readAuditEntries.mockResolvedValue([makeRow("a", new Date("2026-08-22T00:00:00.000Z"))]);
    const controller = new AuditController(audit as unknown as AuditService);

    const res = await controller.data(undefined);

    expect(audit.readAuditEntries).toHaveBeenCalledWith(500, undefined);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe("a");
  });

  it("returns all entries when since is an empty string", async () => {
    const audit = makeAuditMock();
    const controller = new AuditController(audit as unknown as AuditService);

    await controller.data("");

    expect(audit.readAuditEntries).toHaveBeenCalledWith(500, undefined);
  });

  it("passes a valid since cursor through as a Date", async () => {
    const audit = makeAuditMock();
    const controller = new AuditController(audit as unknown as AuditService);

    await controller.data("2026-08-22T10:00:00.000Z");

    expect(audit.readAuditEntries).toHaveBeenCalledWith(500, new Date("2026-08-22T10:00:00.000Z"));
  });

  it("rejects a non-ISO since value with 400", async () => {
    const audit = makeAuditMock();
    const controller = new AuditController(audit as unknown as AuditService);

    await expect(controller.data("not-a-date")).rejects.toMatchObject({
      status: 400,
      response: { error: "since must be a valid ISO timestamp" },
    });
    expect(audit.readAuditEntries).not.toHaveBeenCalled();
  });

  it("returns entries newer than or equal to the cursor via the service query", async () => {
    // Two entries sharing the cursor millisecond must both survive the
    // incremental fetch: the query uses gte, not gt.
    const cursor = new Date("2026-08-22T10:00:00.000Z");
    const rows = [makeRow("newer", new Date("2026-08-22T10:00:01.000Z")), makeRow("sibling", new Date(cursor)), makeRow("older", new Date("2026-08-22T09:59:59.999Z"))];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = { auditLog: { findMany } } as unknown as PrismaService;
    const service = new AuditService(prisma);

    const entries = await service.readAuditEntries(500, cursor);

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 500,
      where: { createdAt: { gte: cursor } },
    });
    expect(entries.map((entry) => entry.id)).toEqual(["newer", "sibling", "older"]);
  });
});
