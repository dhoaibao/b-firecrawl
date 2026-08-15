import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import { encryptSettingValue } from "../common/crypto";

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_hash: string;
  key_value: string | null;
  key_prefix: string;
  revoked: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

function toKey(key: {
  id: string; name: string; keyHash: string; keyValue: string | null; keyPrefix: string;
  revoked: boolean; createdAt: Date; updatedAt: Date; lastUsedAt: Date | null;
}): ApiKeyRecord {
  return {
    id: key.id,
    name: key.name,
    key_hash: key.keyHash,
    key_value: key.keyValue,
    key_prefix: key.keyPrefix,
    revoked: key.revoked,
    created_at: key.createdAt.toISOString(),
    updated_at: key.updatedAt.toISOString(),
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ApiKeysService {
  private readonly lastTouchById = new Map<string, number>();
  private readonly touchDebounceMs = 60_000;
  private readonly touchTrackerMaxSize = 10_000;

  constructor(private readonly prisma: PrismaService, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async createApiKey(name: string) {
    const key = `fc_${crypto.randomBytes(32).toString("base64url")}`;
    const row = await this.prisma.apiKey.create({ data: {
      id: crypto.randomUUID(), name, keyHash: this.hashApiKey(key),
      keyValue: encryptSettingValue(key, this.config.firecrawlKeysEncryptionKey), keyPrefix: key.slice(0, 8),
    } });
    const { key_value: _keyValue, ...keyData } = toKey(row);
    return { ...keyData, key };
  }

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const rows = await this.prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toKey);
  }

  async getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    return row ? toKey(row) : null;
  }

  async revokeApiKey(id: string): Promise<ApiKeyRecord | null> {
    try { return toKey(await this.prisma.apiKey.update({ where: { id }, data: { revoked: true } })); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null; throw error; }
  }

  async validateApiKey(key: string): Promise<ApiKeyRecord | null> {
    const row = await this.prisma.apiKey.findFirst({ where: { keyHash: this.hashApiKey(key), revoked: false } });
    return row ? toKey(row) : null;
  }

  async touchApiKey(id: string): Promise<void> {
    const now = Date.now();
    const last = this.lastTouchById.get(id);
    if (last && now - last < this.touchDebounceMs) { this.recordTouch(id, last); return; }
    await this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date(now) } });
    this.recordTouch(id, now);
  }

  clearTouchDebouncer(): void { this.lastTouchById.clear(); }

  hashApiKey(key: string): string { return crypto.createHash("sha256").update(key).digest("hex"); }

  private recordTouch(id: string, timestamp: number): void {
    if (this.lastTouchById.has(id)) this.lastTouchById.delete(id);
    else if (this.lastTouchById.size >= this.touchTrackerMaxSize) {
      const oldest = this.lastTouchById.keys().next().value;
      if (oldest) this.lastTouchById.delete(oldest);
    }
    this.lastTouchById.set(id, timestamp);
  }
}
