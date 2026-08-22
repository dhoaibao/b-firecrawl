import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestWithContext } from "../common/types";
import { ProxyService } from "./proxy.service";

const config = {
  cloudBaseUrl: "https://cloud.test",
  requestTimeoutMs: 1_000,
  maxBodyBytes: 1_024 * 1_024,
  authEnabled: false,
  firecrawlKeysEncryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function makeRequest(overrides: Record<string, unknown> = {}): RequestWithContext {
  return {
    method: "POST",
    raw: { url: "/v1/test" },
    url: "/v1/test",
    headers: {},
    body: undefined,
    rawBody: Buffer.alloc(0),
    requestId: "request-1",
    ...overrides,
  } as unknown as RequestWithContext;
}

function makeReply(events: string[] = []) {
  const reply = {
    code: vi.fn(),
    headers: vi.fn(),
    send: vi.fn(),
    hijack: vi.fn(),
    raw: {},
  };
  reply.code.mockReturnValue(reply);
  reply.headers.mockReturnValue(reply);
  reply.send.mockImplementation(() => {
    events.push("reply-sent");
    return reply;
  });
  return reply;
}

function makeSettings() {
  return {
    getDefaultRouteMode: vi.fn().mockResolvedValue("self-hosted-only"),
    getSetting: vi.fn().mockImplementation(async (key: string) => key === "self_hosted_firecrawl_url"
      ? { key, value: "https://self.test/", updated_at: "2026-01-01T00:00:00.000Z" }
      : null),
  };
}

function makeService(settings = makeSettings(), audit = { appendAudit: vi.fn().mockResolvedValue(undefined) }) {
  return new ProxyService(
    config as never,
    settings as never,
    { validateApiKey: vi.fn() } as never,
    audit as never,
  );
}

function remainingCredits(service: ProxyService, key: string): Promise<number | null> {
  return (service as unknown as { getRemainingCredits: (apiKey: string) => Promise<number | null> }).getRemainingCredits(key);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ProxyService", () => {
  it("sends the response before the audit insert settles, but waits for the insert", async () => {
    const events: string[] = [];
    let resolveAudit!: () => void;
    const auditDone = new Promise<void>((resolve) => { resolveAudit = resolve; });
    const audit = {
      appendAudit: vi.fn(async () => {
        events.push("audit-started");
        await auditDone;
        events.push("audit-settled");
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const service = makeService(makeSettings(), audit);
    const reply = makeReply(events);

    const handled = service.handle(makeRequest(), reply as never);
    for (let i = 0; i < 10 && events.length < 2; i++) await Promise.resolve();

    expect(events).toEqual(["audit-started", "reply-sent"]);
    let returned = false;
    void handled.then(() => { returned = true; });
    await Promise.resolve();
    expect(returned).toBe(false);

    resolveAudit();
    await handled;
    expect(events).toEqual(["audit-started", "reply-sent", "audit-settled"]);
  });

  it("does not fail the response when an audit insert unexpectedly rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const audit = { appendAudit: vi.fn().mockRejectedValue(new Error("audit unavailable")) };
    const service = makeService(makeSettings(), audit);
    const reply = makeReply();

    await expect(service.handle(makeRequest(), reply as never)).resolves.toBeUndefined();
    expect(reply.send).toHaveBeenCalledTimes(1);
  });

  it("loads route mode and self-hosted URL concurrently without changing resolution", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    let resolveMode!: (value: string) => void;
    let resolveUrl!: (value: { key: string; value: string; updated_at: string }) => void;
    const track = () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return () => { inFlight--; };
    };
    const settings = {
      getDefaultRouteMode: vi.fn(() => {
        const done = track();
        return new Promise<string>((resolve) => {
          resolveMode = (value) => { done(); resolve(value); };
        });
      }),
      getSetting: vi.fn((key: string) => {
        if (key !== "self_hosted_firecrawl_url") return Promise.resolve(null);
        const done = track();
        return new Promise<{ key: string; value: string; updated_at: string }>((resolve) => {
          resolveUrl = (value) => { done(); resolve(value); };
        });
      }),
    };
    const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = makeService(settings, audit);
    const reply = makeReply();

    const handled = service.handle(makeRequest(), reply as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(settings.getDefaultRouteMode).toHaveBeenCalledTimes(1);
    expect(settings.getSetting).toHaveBeenCalledWith("self_hosted_firecrawl_url");
    expect(peakInFlight).toBe(2);

    resolveMode("self-hosted-only");
    resolveUrl({ key: "self_hosted_firecrawl_url", value: "https://self.test/", updated_at: "2026-01-01T00:00:00.000Z" });
    await handled;

    expect(fetchMock).toHaveBeenCalledWith("https://self.test/v1/test", expect.objectContaining({ method: "POST" }));
    expect(audit.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ route_mode: "self-hosted-only" }));
  });

  it("serves expired credit data while refreshing it in the background", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { remainingCredits: 500 } }), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const service = makeService();
    const key = "fc_swr-credit-test";

    await expect(remainingCredits(service, key)).resolves.toBe(500);
    vi.setSystemTime(1_000_000 + 30_001);

    await expect(remainingCredits(service, key)).resolves.toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRefresh(new Response(JSON.stringify({ data: { remainingCredits: 425 } }), { status: 200 }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await expect(remainingCredits(service, key)).resolves.toBe(425);
  });

  it("serves a stale value within the max-staleness bound and drops it beyond", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { remainingCredits: 500 } }), { status: 200 }))
      // Every refresh after the first fails, so the value never gets renewed.
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = makeService();
    const key = "fc_staleness-credit-test";

    await expect(remainingCredits(service, key)).resolves.toBe(500);

    // Just inside the 5-minute staleness bound: stale value still served.
    vi.setSystemTime(1_000_000 + 4 * 60 * 1000);
    await expect(remainingCredits(service, key)).resolves.toBe(500);

    // Beyond the bound: entry is dropped and the failed refresh falls back
    // to null, exactly like a cache miss.
    vi.setSystemTime(1_000_000 + 5 * 60 * 1000 + 1);
    await expect(remainingCredits(service, key)).resolves.toBeNull();
    // A subsequent read also misses the cache (no stale pinning).
    await expect(remainingCredits(service, key)).resolves.toBeNull();
  });
});
