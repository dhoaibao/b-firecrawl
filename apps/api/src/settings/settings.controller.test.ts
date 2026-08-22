import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsController } from "./settings.controller";
import { encryptSettingValue, generateEncryptionKey } from "../common/crypto";

describe("SettingsController creditUsage", () => {
  const encryptionKey = generateEncryptionKey();
  const config = {
    cloudBaseUrl: "https://api.firecrawl.dev",
    firecrawlKeysEncryptionKey: encryptionKey,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coalesces concurrent requests for the same key into a single remote fetch", async () => {
    const rawKeys = ["fc_test_key_1234567890abcdef"];
    const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
    const settings = {
      getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockImplementation(() => fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);

    const promise1 = controller.creditUsage();
    const promise2 = controller.creditUsage();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(
        JSON.stringify({
          data: {
            remainingCredits: 500,
            planCredits: 1000,
            billingPeriodStart: "2026-08-01T00:00:00Z",
            billingPeriodEnd: "2026-09-01T00:00:00Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1).toEqual({
      data: [
        {
          keyIndex: 0,
          keyPrefix: "fc_test_...cdef",
          remainingCredits: 500,
          planCredits: 1000,
          billingPeriodStart: "2026-08-01T00:00:00Z",
          billingPeriodEnd: "2026-09-01T00:00:00Z",
        },
      ],
    });
    expect(res2).toEqual(res1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves sequential polls from the TTL cache and refetches after expiry", async () => {
    vi.useFakeTimers();
    try {
      const rawKeys = ["fc_test_key_1234567890abcdef"];
      const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
      const settings = {
        getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
        setSetting: vi.fn().mockResolvedValue(undefined),
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: { remainingCredits: 500, planCredits: 1000 } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: { remainingCredits: 450, planCredits: 1000 } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      const controller = new SettingsController(settings as never, config as never);

      const res1 = await controller.creditUsage();
      expect(res1.data[0].remainingCredits).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const res2 = await controller.creditUsage();
      expect(res2.data[0].remainingCredits).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30_000);

      const res3 = await controller.creditUsage();
      expect(res3.data[0].remainingCredits).toBe(450);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache HTTP error results across sequential polls", async () => {
    const rawKeys = ["fc_test_key_1234567890abcdef"];
    const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
    const settings = {
      getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500, statusText: "Internal Server Error" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { remainingCredits: 300, planCredits: 1000 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);

    const res1 = await controller.creditUsage();
    expect(res1.data[0].error).toBe("HTTP 500: boom");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const res2 = await controller.creditUsage();
    expect(res2.data[0].error).toBeUndefined();
    expect(res2.data[0].remainingCredits).toBe(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent failing requests and does not cache failure for subsequent requests", async () => {
    const rawKeys = ["fc_test_key_1234567890abcdef"];
    const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
    const settings = {
      getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    let rejectFetch!: (reason: Error) => void;
    const failingPromise = new Promise<Response>((_, reject) => {
      rejectFetch = reject;
    });

    const fetchMock = vi.fn()
      .mockImplementationOnce(() => failingPromise)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { remainingCredits: 100, planCredits: 1000 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);

    const promise1 = controller.creditUsage();
    const promise2 = controller.creditUsage();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    rejectFetch(new Error("Network timeout"));

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1.data[0].error).toBe("Network timeout");
    expect(res1.data[0].remainingCredits).toBeNull();
    expect(res2).toEqual(res1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const res3 = await controller.creditUsage();
    expect(res3.data[0].error).toBeUndefined();
    expect(res3.data[0].remainingCredits).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns HTTP error details properly when upstream returns non-200", async () => {
    const rawKeys = ["fc_test_key_1234567890abcdef"];
    const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
    const settings = {
      getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);
    const res = await controller.creditUsage();

    expect(res.data[0].error).toBe("HTTP 401: Unauthorized");
    expect(res.data[0].remainingCredits).toBeNull();
  });

  it("returns empty list when no firecrawl api keys are configured", async () => {
    const settings = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);
    const res = await controller.creditUsage();

    expect(res).toEqual({ data: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces lookups per key when multiple distinct keys are configured", async () => {
    const rawKeys = ["fc_test_key_1111111111aaaa", "fc_test_key_2222222222bbbb"];
    const encrypted = encryptSettingValue(JSON.stringify(rawKeys), encryptionKey);
    const settings = {
      getSetting: vi.fn().mockResolvedValue({ key: "firecrawl_api_keys", value: encrypted }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    };

    let resolveFetch1!: (value: Response) => void;
    let resolveFetch2!: (value: Response) => void;
    const fetchPromise1 = new Promise<Response>((r) => { resolveFetch1 = r; });
    const fetchPromise2 = new Promise<Response>((r) => { resolveFetch2 = r; });

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      if (auth?.includes("1111111111aaaa")) return fetchPromise1;
      return fetchPromise2;
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new SettingsController(settings as never, config as never);

    const promise1 = controller.creditUsage();
    const promise2 = controller.creditUsage();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveFetch1(
      new Response(JSON.stringify({ data: { remainingCredits: 100, planCredits: 500 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    resolveFetch2(
      new Response(JSON.stringify({ data: { remainingCredits: 200, planCredits: 1000 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1.data).toHaveLength(2);
    expect(res1.data[0].remainingCredits).toBe(100);
    expect(res1.data[1].remainingCredits).toBe(200);
    expect(res2).toEqual(res1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
