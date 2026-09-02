import { describe, expect, it, vi } from "vitest";
import { ApiKeysController } from "./api-keys.controller";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    name: "production",
    key_hash: "secret-hash",
    key_value: "encrypted-secret",
    key_prefix: "fc_test",
    revoked: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_used_at: null,
    ...overrides,
  };
}

describe("ApiKeysController", () => {
  it("sanitizes list, read, and revoke responses", async () => {
    const key = record({ key: "legacy-secret" });
    const keys = {
      listApiKeys: vi.fn().mockResolvedValue([key]),
      getApiKeyById: vi.fn().mockResolvedValue(key),
      revokeApiKey: vi.fn().mockResolvedValue(record({ revoked: true })),
    };
    const controller = new ApiKeysController(keys as never);

    const responses = [
      (await controller.list()).data[0],
      (await controller.get("key-1")).data,
      (await controller.revoke("key-1")).data,
    ];

    for (const response of responses) {
      expect(response).toEqual(
        expect.objectContaining({ id: "key-1", name: "production", key_prefix: "fc_test" }),
      );
      expect(response).not.toHaveProperty("key");
      expect(response).not.toHaveProperty("key_value");
      expect(response).not.toHaveProperty("key_hash");
    }
  });

  it("returns plaintext only from key creation", async () => {
    const created = { ...record(), key: "fc_one-time-secret" };
    const keys = {
      createApiKey: vi.fn().mockResolvedValue(created),
    };
    const controller = new ApiKeysController(keys as never);

    await expect(controller.create({ name: "production" })).resolves.toEqual({ data: created });
    expect(keys.createApiKey).toHaveBeenCalledWith("production");
  });
});
