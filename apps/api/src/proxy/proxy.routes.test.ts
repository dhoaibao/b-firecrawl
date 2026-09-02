import { describe, expect, it, vi } from "vitest";
import { ProxyRoutes } from "./proxy.routes";

describe("ProxyRoutes", () => {
  it("authorizes the playground with the signed single-admin session", async () => {
    const registrations: Array<{
      path: string;
      handler: (request: unknown, reply: unknown) => Promise<void>;
    }> = [];
    const proxy = { handle: vi.fn().mockResolvedValue(undefined) };
    const sessions = { getAdmin: vi.fn().mockReturnValue({ email: "admin@example.com" }) };
    const routes = new ProxyRoutes(
      {
        httpAdapter: {
          getInstance: () => ({
            all: (path: string, handler: (request: unknown, reply: unknown) => Promise<void>) =>
              registrations.push({ path, handler }),
          }),
        },
      } as never,
      proxy as never,
      sessions as never,
      { authEnabled: true } as never,
    );
    routes.onModuleInit();

    const request = {
      raw: { url: "/admin/api/playground/v1/test" },
      url: "/admin/api/playground/v1/test",
    };
    await registrations
      .find(({ path }) => path === "/admin/api/playground/v1/*")!
      .handler(request, {});

    expect(proxy.handle).toHaveBeenCalledWith(
      expect.objectContaining({ admin: { email: "admin@example.com" } }),
      {},
      "/v1/test",
    );
  });
});
