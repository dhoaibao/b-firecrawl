import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";

@Injectable()
export class CronService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  isAuthorized(authorization: string | undefined): boolean {
    return Boolean(this.config.cronSecret) && authorization === `Bearer ${this.config.cronSecret}`;
  }

  async runMaintenance(): Promise<{ revoked: number; rateLimitsDeleted: number }> {
    const revoked = await this.revokeInactiveKeys();
    const rateLimitsDeleted = await this.deleteExpiredRateLimits();
    return { revoked, rateLimitsDeleted };
  }

  private async deleteExpiredRateLimits(): Promise<number> {
    const deleted = await this.prisma.$queryRaw<Array<{ key: string }>>(Prisma.sql`
      DELETE FROM rate_limits
      WHERE key IN (
        SELECT key
        FROM rate_limits
        WHERE reset_at < NOW()
        ORDER BY reset_at ASC
        LIMIT 1000
      )
      RETURNING key
    `);
    return deleted.length;
  }

  private async revokeInactiveKeys(): Promise<number> {
    const record = await this.settings.getSetting("api_key_inactivity_revoke_days");
    const days = Number(record?.value);
    if (!Number.isFinite(days) || days <= 0) return 0;
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return (await this.prisma.apiKey.updateMany({ where: { revoked: false, createdAt: { lt: threshold }, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: threshold } }] }, data: { revoked: true } })).count;
  }
}
