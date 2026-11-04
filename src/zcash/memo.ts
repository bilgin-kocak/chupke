import { isReplyAddress } from "./address.js";
import { zatToZec } from "./zip321.js";

/**
 * Memo formats (SPEC §5). Memo text is data, never instructions. Every memo is at most 512 bytes.
 * The tags "#<orderId> delivered" and "ref <txid8>" let the worker find its own sends after a crash.
 */
export const MEMO_MAX_BYTES = 512;
export const PAYMENT_MEMO_RE = /^CHUPKE1 o=([0-9A-HJKMNP-TV-Z]{10}) r=(utest1[02-9ac-hj-np-z]+)\s*$/;

export class MemoTooLongError extends Error {
  constructor(what: string) {
    super(`${what} memo does not fit in ${MEMO_MAX_BYTES} bytes`);
    this.name = "MemoTooLongError";
  }
}

export function memoBytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

export function buildPaymentMemo(orderId: string, replyUa: string): string {
  const memo = `CHUPKE1 o=${orderId} r=${replyUa}`;
  if (memoBytes(memo) > MEMO_MAX_BYTES) throw new MemoTooLongError("payment");
  if (!PAYMENT_MEMO_RE.test(memo)) throw new Error("payment memo would not parse");
  return memo;
}

/** Strict parse of a received memo. Anything else is held: it can't be refunded without a reply address. */
export function parsePaymentMemo(memo: string | null): { orderId: string; replyUa: string } | null {
  if (memo === null || memoBytes(memo) > MEMO_MAX_BYTES) return null;
  const m = PAYMENT_MEMO_RE.exec(memo);
  if (!m) return null;
  const replyUa = m[2]!;
  if (!isReplyAddress(replyUa)) return null;
  return { orderId: m[1]!, replyUa };
}

export function deliveryTag(orderId: string): string {
  return `Chupke #${orderId} delivered`;
}

export function refundTag(payingTxid: string): string {
  return `ref ${payingTxid.slice(0, 8)}`;
}

/**
 * One item per line. Never truncates the code or PIN: the redeem link goes first, then the label;
 * if the code and PIN alone don't fit, it throws.
 */
export function buildDeliveryMemo(d: { orderId: string; label: string; code: string | null; pin: string | null; link: string | null }): string {
  const head = deliveryTag(d.orderId);
  const secretLines = [d.code ? `Code: ${d.code}` : null, d.pin ? `PIN: ${d.pin}` : null].filter((l): l is string => l !== null);
  if (secretLines.length === 0 && !d.link) throw new Error("nothing to deliver");
  const attempts: string[][] = [
    [head, d.label, ...secretLines, ...(d.link ? [`Redeem: ${d.link}`] : [])],
    [head, d.label, ...secretLines],
    [head, ...secretLines],
  ];
  for (const lines of attempts) {
    if (secretLines.length === 0 && !lines.some((l) => l.startsWith("Redeem: "))) continue; // a link-only card needs its link
    const memo = lines.join("\n");
    if (memoBytes(memo) <= MEMO_MAX_BYTES) return memo;
  }
  throw new MemoTooLongError("delivery");
}

export function overpaymentTag(orderId: string): string {
  return `Chupke #${orderId} overpayment`;
}

/** Returned excess after a successful delivery: tag line, what was paid vs the price, ref tag. */
export function buildOverpaymentMemo(r: { orderId: string; excessZat: number; paidZat: number; priceZat: number; payingTxid: string }): string {
  const memo = [
    `${overpaymentTag(r.orderId)}: ${zatToZec(r.excessZat)} TAZ returned.`,
    `You paid ${zatToZec(r.paidZat)} TAZ; the price was ${zatToZec(r.priceZat)} TAZ.`,
    refundTag(r.payingTxid),
  ].join("\n");
  if (memoBytes(memo) > MEMO_MAX_BYTES) throw new MemoTooLongError("overpayment");
  return memo;
}

export function buildRefundMemo(r: { orderId: string; reasonText: string; amountZat: number; purchaseFailed: boolean; payingTxid: string }): string {
  const amount = `${zatToZec(r.amountZat)} TAZ returned.`;
  const what = r.purchaseFailed ? "The purchase failed; nothing was bought." : "No purchase was made.";
  const memo = [`Chupke #${r.orderId} refund: ${r.reasonText}`, `${amount} ${what}`, refundTag(r.payingTxid)].join("\n");
  if (memoBytes(memo) > MEMO_MAX_BYTES) throw new MemoTooLongError("refund");
  return memo;
}
