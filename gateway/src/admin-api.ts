import { Router } from "express";
import type { AuditStore } from "./audit-store";
import * as usersService from "./users/service";

export function createAdminRouter(auditStore: AuditStore) {
  const router = Router();

  router.get("/logs", async (_req, res) => {
    const entries = await auditStore.readAuditEntries(500);
    res.json({ data: entries });
  });

  router.get("/data", async (_req, res) => {
    const entries = await auditStore.readAuditEntries(500);
    const durations = entries
      .map((entry) => Number(entry.duration_ms))
      .filter((value) => Number.isFinite(value));
    const avgDuration = durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;

    const totals = {
      total: entries.length,
      local: entries.filter((entry) => entry.backend_used === "local").length,
      cloud: entries.filter((entry) => entry.backend_used === "cloud").length,
      fallbacks: entries.filter((entry) => entry.fallback_used).length,
      avgDuration,
    };

    const users = await usersService.listUsers();
    const sanitizedUsers = users.map((user) => {
      const { password_hash, ...rest } = user;
      return rest;
    });

    res.json({ data: entries, totals, users: sanitizedUsers });
  });

  return router;
}
