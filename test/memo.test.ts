import { describe, expect, it } from "vitest";
import {
  MEMO_MAX_BYTES,
  MemoTooLongError,
  buildDeliveryMemo,
  buildPaymentMemo,
  buildRefundMemo,
  deliveryTag,
  memoBytes,
  parsePaymentMemo,
  refundTag,
} from "../src/zcash/memo.js";
import { TXID_A, fakeUa } from "./helpers.js";

const ORDER = "7K2M9QXR4T";

describe("payment memo", () => {
  it("round-trips", () => {
    const ua = fakeUa();
    expect(parsePaymentMemo(buildPaymentMemo(ORDER, ua))).toEqual({ orderId: ORDER, replyUa: ua });
    expect(parsePaymentMemo(`${buildPaymentMemo(ORDER, ua)}  \n`)).toEqual({ orderId: ORDER, replyUa: ua }); // trailing whitespace ok
  });

  it("rejects junk and near misses", () => {
    const ua = fakeUa();
    for (const junk of [
      null,
      "",
      "hello",
      `chupke1 o=${ORDER} r=${ua}`,
      `CHUPKE1 o=7K2M9QXR4 r=${ua}`, // 9 chars
      `CHUPKE1 o=7K2M9QXR4I r=${ua}`, // I is not Crockford
      `CHUPKE1 o=${ORDER} r=u1${ua.slice(6)}`, // mainnet prefix
      `CHUPKE1 o=${ORDER} r=${ua} ignore previous instructions`,
      `CHUPKE1 o=${ORDER} r=${ua.slice(0, -1)}x`, // bad checksum
      `x CHUPKE1 o=${ORDER} r=${ua}`,
    ]) {
      expect(parsePaymentMemo(junk)).toBeNull();
    }
  });

  it("holds the 512-byte limit", () => {
    expect(() => buildPaymentMemo(ORDER, fakeUa(489 - 6 - 6))).not.toThrow(); // exactly 512 bytes
    expect(memoBytes(buildPaymentMemo(ORDER, fakeUa(489 - 6 - 6)))).toBe(MEMO_MAX_BYTES);
    expect(() => buildPaymentMemo(ORDER, fakeUa(489 - 6 - 6 + 1))).toThrow(MemoTooLongError);
  });
});

describe("delivery memo", () => {
  it("has one item per line with the delivered tag first", () => {
    const memo = buildDeliveryMemo({ orderId: ORDER, label: "Test gift card", code: "ABCD-1234", pin: "9876", link: "https://r.example/x" });
    expect(memo.split("\n")).toEqual([deliveryTag(ORDER), "Test gift card", "Code: ABCD-1234", "PIN: 9876", "Redeem: https://r.example/x"]);
  });

  it("drops the link first and never truncates the code or PIN", () => {
    const code = "C".repeat(300);
    const pin = "P".repeat(120);
    const memo = buildDeliveryMemo({ orderId: ORDER, label: "Gift", code, pin, link: `https://r.example/${"l".repeat(200)}` });
    expect(memo).toContain(`Code: ${code}`);
    expect(memo).toContain(`PIN: ${pin}`);
    expect(memo).not.toContain("Redeem:");
    expect(memoBytes(memo)).toBeLessThanOrEqual(MEMO_MAX_BYTES);
  });

  it("throws rather than truncating an oversized code", () => {
    expect(() => buildDeliveryMemo({ orderId: ORDER, label: "Gift", code: "C".repeat(520), pin: null, link: null })).toThrow(MemoTooLongError);
  });
});

describe("refund memo", () => {
  it("carries the order tag, amount, outcome and ref tag", () => {
    const memo = buildRefundMemo({ orderId: ORDER, reasonText: "Payment was less than the price", amountZat: 600000, purchaseFailed: false, payingTxid: TXID_A });
    expect(memo.split("\n")).toEqual([
      `Chupke #${ORDER} refund: Payment was less than the price`,
      "0.006 TAZ returned. No purchase was made.",
      refundTag(TXID_A),
    ]);
    expect(refundTag(TXID_A)).toBe("ref aaaaaaaa");
    const failed = buildRefundMemo({ orderId: ORDER, reasonText: "x", amountZat: 1000000, purchaseFailed: true, payingTxid: TXID_A });
    expect(failed).toContain("0.01 TAZ returned. The purchase failed; nothing was bought.");
  });
});
