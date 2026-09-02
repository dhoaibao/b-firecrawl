import { describe, expect, it } from "vitest";
import { chooseInitialBackend, getRouteMode, isFallbackAllowed, requestNeedsCloud } from "./policy";

describe("routing policy", () => {
  it("honors a valid per-request route mode", () => {
    expect(getRouteMode("/v1/scrape?routeMode=self-hosted-only", {}, "cloud-first")).toBe(
      "self-hosted-only",
    );
    expect(
      getRouteMode("/v1/scrape", { "x-firecrawl-route-mode": "cloud-only" }, "self-hosted-first"),
    ).toBe("cloud-only");
  });

  it("routes managed features to cloud", () => {
    const needsCloud = requestNeedsCloud("/v1/agent", null);
    expect(needsCloud.required).toBe(true);
    expect(chooseInitialBackend("self-hosted-first", needsCloud)).toBe("cloud");
  });

  it("only permits privacy-safe self-hosted fallback", () => {
    expect(
      isFallbackAllowed("self-hosted-first", {
        hasSensitiveHeaders: false,
        hasPrivateTargetUrl: false,
      }),
    ).toBe(true);
    expect(
      isFallbackAllowed("self-hosted-first", {
        hasSensitiveHeaders: true,
        hasPrivateTargetUrl: false,
      }),
    ).toBe(false);
  });
});
