import { describe, expect, it } from "vitest";
import { hasSensitiveHeaders } from "./policy";
import { headersForPrivacyCheck } from "./proxy";

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
