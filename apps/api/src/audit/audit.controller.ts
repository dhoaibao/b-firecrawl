import { Body, Controller, Delete, Get, Param, Query, UseGuards } from "@nestjs/common";
import { apiError } from "../common/http";
import { AuthGuard } from "../auth/guards";
import { AuditService, type DeleteFilter } from "./audit.service";

const validFilters = ["today", "week", "month", "all"] as const;

@Controller("admin/api")
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("logs")
  async logs() { return { data: await this.audit.readAuditEntries(500) }; }

  @Delete("logs/:id")
  async deleteOne(@Param("id") id: string) {
    if (!await this.audit.deleteAuditEntry(id)) apiError(404, "Audit entry not found");
    return { success: true };
  }

  @Delete("logs")
  async delete(@Query("filter") filter: string | undefined, @Body() body: { ids?: unknown }) {
    if (body?.ids !== undefined) {
      if (!Array.isArray(body.ids)) apiError(400, "ids must be an array");
      if (body.ids.some((id) => typeof id !== "string" || id.trim().length === 0)) apiError(400, "ids must contain only non-empty strings");
      const ids = [...new Set((body.ids as string[]).map((id) => id.trim()))];
      if (ids.length === 0) apiError(400, "At least one log id is required");
      return { success: true, deleted: await this.audit.deleteAuditEntriesByIds(ids) };
    }
    if (!validFilters.includes(filter as typeof validFilters[number])) apiError(400, "Invalid filter. Use: today, week, month, or all");
    return { success: true, deleted: await this.audit.deleteAuditEntries(filter as DeleteFilter) };
  }

  @Get("data")
  async data() {
    const entries = await this.audit.readAuditEntries(500);
    const durations = entries.map((entry) => Number(entry.duration_ms)).filter(Number.isFinite);
    const totals = {
      total: entries.length,
      self_hosted: entries.filter((entry) => entry.backend_used === "self-hosted").length,
      cloud: entries.filter((entry) => entry.backend_used === "cloud").length,
      fallbacks: entries.filter((entry) => entry.fallback_used).length,
      avgDuration: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    };
    return { data: entries, totals };
  }
}
