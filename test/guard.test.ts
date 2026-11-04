import { describe, expect, it } from "vitest";
import type { AllowlistEntry } from "../src/config.js";
import { REASON_TEXT, guard, istDayStart, type GuardInput } from "../src/engine/guard.js";

const TEST: AllowlistEntry = { sku: "test-ok", kind: "test", label: "Test", product_id: "test-gift-card-code", package_id: "test-gift-card-code<&>10", value_usd: 10 };
const REAL: AllowlistEntry = { sku: "gp-100", kind: "real", label: "Google Play ₹100", product_id: "google-play-india", package_id: "google-play-india<&>100", value_usd: 1.08 };

function input(over: Partial<GuardInput> = {}, entry: AllowlistEntry = TEST): GuardInput {
  return {
    pausePurchases: false,
    allowRealPurchases: true,
    maxOrderUsd: 10,
    maxDailyUsd: 30,
    dailyCapIncludesTest: true,
    todaySpendUsd: 0,
    amountZat: 1_000_000,
    order: { sku: entry.sku, kind: entry.kind, product_id: entry.product_id, package_id: entry.package_id ?? null, value: null, value_usd: entry.value_usd, price_zat: 1_000_000 },
    entry,
    ...over,
  };
}

describe("guard: one case per reason, in SPEC order", () => {
  const cases: Array<[string, GuardInput]> = [
    ["paused", input({ pausePurchases: true })],
    ["underpaid", input({ amountZat: 999_999 })],
    ["not_allowed", input({ entry: undefined })],
    ["not_allowed", input({ order: { ...input().order, package_id: "test-gift-card-code<&>20" } })], // mismatch
    ["real_purchases_disabled", input({ allowRealPurchases: false }, REAL)],
    ["over_order_cap", input({ maxOrderUsd: 5 })],
    ["over_daily_cap", input({ todaySpendUsd: 25 })],
  ];
  it.each(cases)("%s", (code, i) => {
    const r = guard(i);
    expect(r).toEqual({ ok: false, code, text: REASON_TEXT[code] });
  });

  it("passes a valid order (exactly at the caps)", () => {
    expect(guard(input({ todaySpendUsd: 20 }))).toEqual({ ok: true });
  });

  it("checks pause before anything else", () => {
    expect(guard(input({ pausePurchases: true, amountZat: 1, entry: undefined }))).toMatchObject({ code: "paused" });
  });

  it("leaves free test products out of the daily cap unless configured", () => {
    expect(guard(input({ dailyCapIncludesTest: false, todaySpendUsd: 30 }))).toEqual({ ok: true });
    expect(guard(input({ dailyCapIncludesTest: false, todaySpendUsd: 29.5 }, REAL))).toMatchObject({ code: "over_daily_cap" });
  });

  it("uses the human texts from the spec", () => {
    expect(REASON_TEXT.paused).toBe("Shop is paused");
    expect(REASON_TEXT.underpaid).toBe("Payment was less than the price");
    expect(REASON_TEXT.not_allowed).toBe("Product not available");
    expect(REASON_TEXT.real_purchases_disabled).toBe("Shop isn't selling this yet");
    expect(REASON_TEXT.over_order_cap).toBe("Over the per-order limit");
    expect(REASON_TEXT.over_daily_cap).toBe("Shop's daily limit reached");
  });
});

describe("istDayStart", () => {
  it("starts the day at 00:00 IST (18:30 UTC the day before)", () => {
    expect(new Date(istDayStart(Date.parse("2026-11-04T07:00:00Z"))).toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(new Date(istDayStart(Date.parse("2026-11-04T18:29:59Z"))).toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(new Date(istDayStart(Date.parse("2026-11-04T18:30:00Z"))).toISOString()).toBe("2026-11-04T18:30:00.000Z");
  });
});
