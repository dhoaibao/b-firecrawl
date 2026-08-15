import { describe, expect, it, vi } from "vitest";
import { CronService } from "./cron.service";

describe("CronService", () => {
  it("cleans a bounded batch of expired rate-limit rows during maintenance", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ key: "expired-1" }, { key: "expired-2" }]),
    };
    const settings = { getSetting: vi.fn().mockResolvedValue(null) };
    const service = new CronService(prisma as never, settings as never, { cronSecret: "secret" } as never);

    await expect(service.runMaintenance()).resolves.toEqual({ revoked: 0, rateLimitsDeleted: 2 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
