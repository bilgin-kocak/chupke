import { describe, expect, it } from "vitest";
import { buildPaymentUri, memoFromBase64Url, memoToBase64Url, parsePaymentUri, zatToZec, zecToZat } from "../src/zcash/zip321.js";
import { fakeUa } from "./helpers.js";

describe("ZIP 321", () => {
  it("formats amounts with at most 8 decimals and no exponent", () => {
    expect(zatToZec(1_000_000)).toBe("0.01");
    expect(zatToZec(100_000_000)).toBe("1");
    expect(zatToZec(1)).toBe("0.00000001");
    expect(zatToZec(123_456_789)).toBe("1.23456789");
    expect(zatToZec(0)).toBe("0");
    expect(zecToZat("0.01")).toBe(1_000_000);
    expect(zecToZat("1.23456789")).toBe(123_456_789);
    expect(() => zecToZat("1e-8")).toThrow();
    expect(() => zecToZat("0.123456789")).toThrow();
  });

  it("encodes memos as base64url without padding", () => {
    for (const memo of ["a", "ab", "abc", "CHUPKE1 o=7K2M9QXR4T r=utest1q?>"]) {
      const b64 = memoToBase64Url(memo);
      expect(b64).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(b64).not.toContain("=");
      expect(memoFromBase64Url(b64)).toBe(memo);
    }
    expect(memoToBase64Url("??>")).toBe("Pz8-"); // '+' -> '-' and no padding
  });

  it("builds and parses a payment request, URL-encoding the message", () => {
    const address = fakeUa();
    const memo = `CHUPKE1 o=7K2M9QXR4T r=${fakeUa()}`;
    const uri = buildPaymentUri({ address, amountZat: 1_000_000, memo, message: "Chupke order 7K2M9QXR4T" });
    expect(uri.startsWith(`zcash:${address}?amount=0.01&memo=`)).toBe(true);
    expect(uri).toContain("&message=Chupke%20order%207K2M9QXR4T");
    expect(parsePaymentUri(uri)).toEqual({ address, amountZat: 1_000_000, memo, message: "Chupke order 7K2M9QXR4T" });
  });

  it("rejects duplicate parameters", () => {
    expect(() => parsePaymentUri(`zcash:${fakeUa()}?amount=1&amount=2`)).toThrow();
  });
});
