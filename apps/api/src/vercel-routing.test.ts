import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("routes every public path to the Nest entrypoint with proxy duration", () => {
    const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")) as {
      functions: Record<string, { runtime: string; maxDuration?: number; includeFiles?: string[] }>;
      routes: Array<{ src: string; dest: string }>;
    };
    const fn = config.functions["src/main.ts"];

    expect(fn?.runtime).toBe("nodejs22.x");
    expect(fn?.maxDuration).toBe(120);
    expect(fn?.includeFiles).toContain("prisma/**");
    expect(config.routes).toContainEqual({ src: "/(.*)", dest: "/src/main.ts" });
    expect(config.routes.every((route) => route.dest.startsWith("/"))).toBe(true);
  });
});
