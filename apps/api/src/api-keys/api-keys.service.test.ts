import { describe, expect, it, vi } from "vitest";
import { ApiKeysService } from "./api-keys.service";

const encryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    name: "global",
    keyHash: "hash",
    keyValue: null,
    keyPrefix: "fc_test",
    revoked: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastUsedAt: null,
    ...overrides,
  };
}

describe("ApiKeysService", () => {
  it("creates global keys without a user owner", async () => {
    const prisma = { apiKey: { create: vi.fn().mockResolvedValue(row()) } };
    const service = new ApiKeysService(
      prisma as never,
      { firecrawlKeysEncryptionKey: encryptionKey } as never,
    );

    const created = await service.createApiKey("global");

    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ userId: expect.anything() }),
    });
    expect(created).toEqual(
      expect.objectContaining({ id: "key-1", name: "global", key: expect.stringMatching(/^fc_/) }),
    );
  });

  it("validates a non-revoked key without loading a user relation", async () => {
    const key = "fc_global-test";
    const prisma = {
      apiKey: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            row({ keyHash: new ApiKeysService({} as never, {} as never).hashApiKey(key) }),
          ),
      },
    };
    const service = new ApiKeysService(
      prisma as never,
      { firecrawlKeysEncryptionKey: encryptionKey } as never,
    );

    const validated = await service.validateApiKey(key);

    expect(validated?.id).toBe("key-1");
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { keyHash: service.hashApiKey(key), revoked: false },
    });
  });

  it("bounds validation cache entries for distinct caller-supplied keys", async () => {
    const prisma = { apiKey: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ApiKeysService(
      prisma as never,
      { firecrawlKeysEncryptionKey: encryptionKey } as never,
    );

    for (let index = 0; index <= 10_000; index++)
      await service.validateApiKey(`fc_distinct-${index}`);

    const cache = (service as unknown as { validationCache: Map<string, unknown> }).validationCache;
    expect(cache.size).toBe(10_000);
  });

  it("deduplicates validation and rejects a cached key immediately after revocation", async () => {
    const key = "fc_global-cached";
    let service!: ApiKeysService;
    const prisma = {
      apiKey: {
        findFirst: vi.fn().mockResolvedValue(row({ keyHash: "unused" })),
        update: vi
          .fn()
          .mockImplementation(async () => row({ keyHash: service.hashApiKey(key), revoked: true })),
      },
    };
    prisma.apiKey.findFirst.mockResolvedValue(
      row({ keyHash: new ApiKeysService({} as never, {} as never).hashApiKey(key) }),
    );
    service = new ApiKeysService(
      prisma as never,
      { firecrawlKeysEncryptionKey: encryptionKey } as never,
    );

    const validations = await Promise.all([
      service.validateApiKey(key),
      service.validateApiKey(key),
    ]);

    expect(validations[0]?.id).toBe("key-1");
    expect(validations[1]?.id).toBe("key-1");
    expect(prisma.apiKey.findFirst).toHaveBeenCalledTimes(1);

    await service.revokeApiKey("key-1");
    prisma.apiKey.findFirst.mockResolvedValue(null);

    await expect(service.validateApiKey(key)).resolves.toBeNull();
    expect(prisma.apiKey.findFirst).toHaveBeenCalledTimes(2);
  });
});
