import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditRoutingService } from "./credit-routing.service";

const config = {
  cloudBaseUrl: "https://cloud.test",
  redisUrl: "redis://localhost:6379",
  firecrawlKeysEncryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function makeLedger(overrides: Record<string, unknown> = {}) {
  return {
    reserve: vi.fn().mockResolvedValue({ kind: "unavailable" }),
    capture: vi.fn().mockResolvedValue({ available: false, sequence: 0 }),
    reconcile: vi.fn().mockResolvedValue(true),
    settle: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CreditRoutingService", () => {
  it("uses atomic Redis selection when available and passes only opaque key IDs", async () => {
    const ledger = makeLedger({ reserve: vi.fn().mockResolvedValue({ kind: "reserved", index: 1, sequence: 7, reservationKey: "opaque-reservation" }) });
    const service = new CreditRoutingService(config as never, ledger as never);
    const keys = ["fc_first_secret_key", "fc_second_secret_key"];

    const reservation = await service.reserve(keys, 1);

    expect(reservation).toEqual({ key: keys[1], keyId: expect.any(String), amount: 1, source: "redis", reservationKey: "opaque-reservation" });
    expect(reservation?.keyId).not.toBe(keys[1]);
    expect(ledger.reserve).toHaveBeenCalledWith(
      keys.map((key) => service.keyId(key)),
      1,
    );
  });

  it("falls back to local rotation when Redis is unavailable without fetching credit usage", async () => {
    const ledger = makeLedger();
    const service = new CreditRoutingService(config as never, ledger as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const keys = ["fc_first_secret_key", "fc_second_secret_key"];

    const first = await service.reserve(keys, 1);
    const second = await service.reserve(keys, 1);

    expect(first?.key).toBe(keys[0]);
    expect(second?.key).toBe(keys[1]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ledger.reserve).toHaveBeenCalledWith(keys.map((key) => service.keyId(key)), 1);
  });

  it("treats 402 as a disabled pool and 429 as a temporary cooldown", async () => {
    const ledger = makeLedger();
    const service = new CreditRoutingService(config as never, ledger as never);
    const keys = ["fc_first_secret_key", "fc_second_secret_key"];

    const first = await service.reserve(keys, 1);
    expect(first?.key).toBe(keys[0]);
    await service.recordResponse(first!, 402);
    const second = await service.reserve(keys, 1);
    expect(second?.key).toBe(keys[1]);

    await service.recordResponse(second!, 429);
    expect(await service.reserve(keys, 1)).toBeNull();

    expect(ledger.settle).not.toHaveBeenCalled();
  });

  it("keeps locally disabled and cooled-down keys out of recovered Redis reservations", async () => {
    vi.useFakeTimers();
    const ledger = makeLedger();
    const service = new CreditRoutingService(config as never, ledger as never);
    const keys = ["fc_first_secret_key", "fc_second_secret_key", "fc_third_secret_key"];

    const disabled = await service.reserve(keys, 1);
    await service.recordResponse(disabled!, 402);
    const cooledDown = await service.reserve(keys, 1);
    await service.recordResponse(cooledDown!, 429);

    ledger.reserve.mockResolvedValue({ kind: "reserved", index: 0, sequence: 3, reservationKey: "opaque-recovered-reservation" });
    vi.advanceTimersByTime(5_001);
    const recovered = await service.reserve(keys, 1);

    expect(recovered?.key).toBe(keys[1]);
    expect(ledger.reserve).toHaveBeenLastCalledWith([service.keyId(keys[1])], 1);
  });

  it("settles Redis reservations differently for 402 and 429", async () => {
    const ledger = makeLedger({ reserve: vi.fn().mockResolvedValue({ kind: "reserved", index: 0, sequence: 1, reservationKey: "opaque-reservation" }) });
    const service = new CreditRoutingService(config as never, ledger as never);
    const reservation = await service.reserve(["fc_secret_key"], 1);

    await service.recordResponse(reservation!, 402);
    await service.recordResponse({ ...reservation!, keyId: "another-opaque-id", reservationKey: "opaque-reservation-2" }, 429);

    expect(ledger.settle).toHaveBeenNthCalledWith(1, expect.any(String), "opaque-reservation", "disabled");
    expect(ledger.settle).toHaveBeenNthCalledWith(2, "another-opaque-id", "opaque-reservation-2", "cooldown", expect.any(Number));
  });

  it("reconciles successful authoritative refreshes but retains state after failed refreshes", async () => {
    vi.useFakeTimers();
    const ledger = makeLedger({ capture: vi.fn().mockResolvedValue({ available: true, sequence: 12 }) });
    const service = new CreditRoutingService(config as never, ledger as never);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { remainingCredits: 425, planCredits: 1000 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const key = "fc_refresh_secret_key";

    await expect(service.refreshCreditUsage(key)).resolves.toMatchObject({ remainingCredits: 425 });
    expect(ledger.reconcile).toHaveBeenCalledWith(service.keyId(key), 425, 12);
    vi.advanceTimersByTime(30_001);

    await expect(service.refreshCreditUsage(key)).resolves.toMatchObject({ error: "HTTP 503: upstream unavailable" });
    expect(ledger.reconcile).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent refreshes and caches only successful responses", async () => {
    const ledger = makeLedger();
    const service = new CreditRoutingService(config as never, ledger as never);
    let resolveFetch!: (response: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);
    const key = "fc_refresh_secret_key";

    const promise1 = service.refreshCreditUsage(key);
    const promise2 = service.refreshCreditUsage(key);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify({ data: { remainingCredits: 100 } }), { status: 200 }));
    await Promise.all([promise1, promise2]);
    await service.refreshCreditUsage(key);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
