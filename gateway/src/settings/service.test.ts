import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultRouteMode } from "./service";

const mockQuery = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  withClient: async <T, >(fn: (client: unknown) => Promise<T>): Promise<T> => {
    const client = { query: mockQuery, release: mockRelease };
    try {
      return await fn(client);
    } finally {
      mockRelease();
    }
  },
  getPool: () => ({
    connect: mockConnect,
  }),
  initDatabase: vi.fn(),
  pingDatabase: vi.fn(),
}));

describe("getDefaultRouteMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored value when valid", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          key: "default_route_mode",
          value: "cloud-first",
          updated_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getDefaultRouteMode("local-first");
    expect(result).toBe("cloud-first");
  });

  it("falls back when setting is missing", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await getDefaultRouteMode("local-first");
    expect(result).toBe("local-first");
  });

  it("falls back when stored value is invalid", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          key: "default_route_mode",
          value: "invalid",
          updated_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getDefaultRouteMode("local-only");
    expect(result).toBe("local-only");
  });
});
