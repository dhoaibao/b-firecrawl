import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const VALID_ROUTE_MODES = [
  "self-hosted-first",
  "self-hosted-only",
  "cloud-first",
  "cloud-only",
] as const;
export type RouteMode = (typeof VALID_ROUTE_MODES)[number];
export interface SettingRecord {
  key: string;
  value: string;
  updated_at: string;
}

@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { value: SettingRecord | null; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<SettingRecord | null>>();
  private readonly ttl = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async getSetting(key: string): Promise<SettingRecord | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    this.cache.delete(key);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const request = this.prisma.setting
      .findUnique({ where: { key } })
      .then((row) =>
        row ? { key: row.key, value: row.value, updated_at: row.updatedAt.toISOString() } : null,
      );
    this.inflight.set(key, request);
    try {
      const value = await request;
      if (this.inflight.get(key) === request)
        this.cache.set(key, { value, expiresAt: Date.now() + this.ttl });
      return value;
    } finally {
      if (this.inflight.get(key) === request) this.inflight.delete(key);
    }
  }

  async listSettings(): Promise<SettingRecord[]> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: "asc" } });
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updated_at: row.updatedAt.toISOString(),
    }));
  }

  async setSetting(key: string, value: string): Promise<SettingRecord> {
    const row = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache.delete(key);
    this.inflight.delete(key);
    return { key: row.key, value: row.value, updated_at: row.updatedAt.toISOString() };
  }

  async deleteSetting(key: string): Promise<boolean> {
    try {
      await this.prisma.setting.delete({ where: { key } });
      this.cache.delete(key);
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
        return false;
      throw error;
    }
  }

  async getDefaultRouteMode(fallback: RouteMode): Promise<RouteMode> {
    const setting = await this.getSetting("default_route_mode");
    return setting && (VALID_ROUTE_MODES as readonly string[]).includes(setting.value)
      ? (setting.value as RouteMode)
      : fallback;
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
