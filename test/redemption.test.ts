import { describe, expect, it } from "vitest";
import { hasRedeemable, maskRedemption, normalizeRedemption } from "../src/bitrefill/redemption.js";

describe("normalizeRedemption", () => {
  it("treats a plain string as the code (OpenAPI shape)", () => {
    expect(normalizeRedemption("ABCD-1234-EFGH")).toEqual({ code: "ABCD-1234-EFGH", pin: null, link: null, instructions: null });
  });

  it("treats a URL string as the link", () => {
    expect(normalizeRedemption("https://example.com/redeem/xyz").link).toBe("https://example.com/redeem/xyz");
  });

  it("reads the object shape (Bitrefill skill)", () => {
    const r = normalizeRedemption({ code: "C0DE", pin: "9876", link: "https://r.example/x", instructions: "Use at checkout" });
    expect(r).toEqual({ code: "C0DE", pin: "9876", link: "https://r.example/x", instructions: "Use at checkout" });
    expect(hasRedeemable(r)).toBe(true);
  });

  it("parses a JSON-encoded string and tolerates empties", () => {
    expect(normalizeRedemption('{"code":"X1","pin":"22"}')).toMatchObject({ code: "X1", pin: "22" });
    expect(hasRedeemable(normalizeRedemption(null))).toBe(false);
    expect(hasRedeemable(normalizeRedemption(""))).toBe(false);
    expect(hasRedeemable(normalizeRedemption({}))).toBe(false);
  });
});

describe("maskRedemption", () => {
  it("never contains the code, PIN or full link", () => {
    const r = normalizeRedemption({ code: "SECRETCODE123456", pin: "4242", link: "https://r.example/claim/SECRETPATH" });
    const masked = JSON.stringify(maskRedemption(r));
    expect(masked).not.toContain("SECRETCODE123456");
    expect(masked).not.toContain("4242");
    expect(masked).not.toContain("SECRETPATH");
    expect(masked).toContain("16 chars");
  });
});
