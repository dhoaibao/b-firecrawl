import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("routes every public path to the Nest entrypoint with proxy duration", () => {
    const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")) as {
      functions: Record<string, { maxDuration?: number; includeFiles?: string | string[] }>;
      routes: Array<{ src: string; dest: string }>;
      crons: Array<{ path: string; schedule: string }>;
    };
    const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
      engines?: { node?: string };
    };
    const handlerSource = readFileSync(join(__dirname, "..", "api/index.js"), "utf8").trim();
    const fn = config.functions["api/index.js"];

    expect(packageJson.engines?.node).toBe("22.x");
    expect(handlerSource).toBe(
      'const { default: handler } = require("../dist/main.js");\n\nmodule.exports = handler;',
    );
    expect(fn?.maxDuration).toBe(120);
    expect(fn?.includeFiles).toBe("prisma/**");
    expect(config.routes).toContainEqual({ src: "/(.*)", dest: "/api/index.js" });
    expect(config.routes.every((route) => route.dest.startsWith("/"))).toBe(true);
    expect(config.crons).toContainEqual({ path: "/api/cron/maintenance", schedule: "0 0 * * *" });
  });
});
