import { describe, expect, it } from "vitest";
import { paymentKey } from "../src/zcash/wallet.js";
import { minedHeightFromStatus, parseBalanceTotal } from "../src/zcash/zingo.js";

const TXID = "2683a6a85de9b5ac7861bd48ca2a7a87c36f54e6be8e9d0b2245d777b7fd6046";

describe("zingo-cli output parsing", () => {
  it("reads the mined height from a note status", () => {
    expect(minedHeightFromStatus("confirmed at block height 4581215")).toBe(4581215);
    expect(minedHeightFromStatus("mempool at block height 4581216")).toBeNull();
    expect(minedHeightFromStatus("transmitted at block height 4581216")).toBeNull();
  });

  it("sums the non-JSON balance listing with underscore digit separators", () => {
    const text = [
      "[",
      "    confirmed_ironwood_balance: 100_000_000",
      "    unconfirmed_ironwood_balance: 0",
      "    total_ironwood_balance: 100_000_000",
      "",
      "    total_orchard_balance: 0",
      "    total_sapling_balance: 2_500",
      "    total_transparent_balance: 0",
      "]",
    ].join("\n");
    expect(parseBalanceTotal(text)).toBe(100_002_500);
  });
});

describe("paymentKey", () => {
  it("uses txid:pool:index when the index is known", () => {
    expect(paymentKey({ txid: TXID, pool: "ironwood", outputIndex: 1, memo: null, amountZat: 5 })).toBe(`${TXID}:ironwood:1`);
  });

  it("falls back to a memo|amount digest, stable across calls", () => {
    const a = paymentKey({ txid: TXID, pool: "ironwood", outputIndex: null, memo: "m", amountZat: 5 });
    const b = paymentKey({ txid: TXID, pool: "ironwood", outputIndex: null, memo: "m", amountZat: 5 });
    const c = paymentKey({ txid: TXID, pool: "ironwood", outputIndex: null, memo: "m", amountZat: 6 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(new RegExp(`^${TXID}:[0-9a-f]{8}$`));
  });
});
