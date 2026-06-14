import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasSensitiveHeaders } from "./policy";
import { headersForPrivacyCheck, createProxyHandler } from "./proxy";
import type { AuditStore } from "./audit-store";
import type { GatewayConfig } from "./types";

const mockGetDefaultRouteMode = vi.hoisted(() => vi.fn());
const mockGetSetting = vi.hoisted(() => vi.fn());

vi.mock("./settings/service", () => ({
  getSetting: mockGetSetting,
  listSettings: vi.fn(),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
  getDefaultRouteMode: mockGetDefaultRouteMode,
  VALID_ROUTE_MODES: ["local-first", "local-only", "cloud-first"],
}));

vi.mock("./api-keys/service", () => ({
  validateApiKey: vi.fn().mockResolvedValue(null),
  touchApiKey: vi.fn(),
}));

vi.mock("./users/service", () => ({
  getUserById: vi.fn(),
  checkUserAccess: vi.fn().mockReturnValue({ allowed: true }),
}));

describe("headersForPrivacyCheck", () => {
  it("ignores gateway bearer auth when product auth is enabled", () => {
    const headers = headersForPrivacyCheck(
      { authorization: "Bearer fc_virtual_key" },
      true,
    );

    expect(hasSensitiveHeaders(headers, null)).toBe(false);
  });

  it("keeps authorization sensitive when product auth is disabled", () => {
    const headers = headersForPrivacyCheck(
      { authorization: "Bearer upstream_secret" },
      false,
    );

    expect(hasSensitiveHeaders(headers, null)).toBe(true);
  });

  it("still treats target headers in the body as sensitive", () => {
    const headers = headersForPrivacyCheck(
      { authorization: "Bearer fc_virtual_key" },
      true,
    );

    expect(
      hasSensitiveHeaders(headers, {
        headers: { Authorization: "Bearer upstream_secret" },
      }),
    ).toBe(true);
  });

  it("removes authorization case-insensitively without mutating input", () => {
    const original = { Authorization: "Bearer fc_virtual_key" };
    const headers = headersForPrivacyCheck(original, true);

    expect(headers).toEqual({});
    expect(original).toEqual({ Authorization: "Bearer fc_virtual_key" });
  });
});

describe("createProxyHandler route mode resolution", () => {
  const baseConfig: GatewayConfig = {
    port: 8080,
    localBaseUrl: "http://localhost:3002",
    cloudBaseUrl: "https://api.firecrawl.dev",
    defaultRouteMode: "local-first",
    requestTimeoutMs: 120_000,
    logFile: "/tmp/test.log",
    maxBodyBytes: 5_242_880,
    authEnabled: false,
    databaseUrl: "postgresql://localhost/test",
    sessionSecret: "secret",
    adminEmail: "",
    adminPassword: "",
    trustProxy: false,
  };

  const auditStore: AuditStore = {
    appendAudit: vi.fn().mockResolvedValue(undefined),
    readAuditEntries: vi.fn().mockResolvedValue([]),
    deleteAuditEntries: vi.fn().mockResolvedValue(0),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultRouteMode.mockResolvedValue("local-first");
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "firecrawl_api_keys") {
        return { key, value: '["fc_test_key"]', updated_at: new Date().toISOString() };
      }
      return null;
    });
  });

  it("uses the database setting as the default route mode", async () => {
    mockGetDefaultRouteMode.mockResolvedValue("cloud-first");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => Buffer.from(JSON.stringify({ success: true })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = createProxyHandler({ config: baseConfig, auditStore });
    const req = {
      method: "POST",
      url: "/v1/scrape",
      originalUrl: "/v1/scrape",
      headers: { "content-type": "application/json" },
      requestId: "req-1",
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({ url: "https://example.com" }));
      },
      on: vi.fn(),
      pipe: vi.fn(),
    } as unknown as import("express").Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    } as unknown as import("express").Response;

    await handler(req, res);

    expect(mockGetDefaultRouteMode).toHaveBeenCalledWith("local-first");
    expect(fetchMock).toHaveBeenCalled();
    const callUrl = fetchMock.mock.calls[0]?.[0];
    expect(callUrl).toContain("api.firecrawl.dev");

    vi.unstubAllGlobals();
  });

  it("uses the env default as the resolved route mode when database setting is unset", async () => {
    mockGetDefaultRouteMode.mockResolvedValue("local-only");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => Buffer.from(JSON.stringify({ success: true })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = createProxyHandler({ config: { ...baseConfig, defaultRouteMode: "local-only" }, auditStore });
    const req = {
      method: "POST",
      url: "/v1/scrape",
      originalUrl: "/v1/scrape",
      headers: { "content-type": "application/json" },
      requestId: "req-2",
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({ url: "https://example.com" }));
      },
      on: vi.fn(),
      pipe: vi.fn(),
    } as unknown as import("express").Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    } as unknown as import("express").Response;

    await handler(req, res);

    expect(mockGetDefaultRouteMode).toHaveBeenCalledWith("local-only");

    vi.unstubAllGlobals();
  });
});
