import type { PaymentRow } from "../db/store.js";
import { buildRefundMemo, refundTag } from "../zcash/memo.js";
import { NotSupportedError, SendNotBroadcastError } from "../zcash/wallet.js";
import { backoffAt, errMsg, type EngineDeps } from "./deps.js";
import { PURCHASE_FAILED_REASONS, reasonCode, reasonText } from "./guard.js";

/** Reasons where the order itself stays as it is (another payment owns it, or there is no order). */
const ORDER_UNTOUCHED = new Set(["duplicate_payment", "unknown_order"]);

/**
 * refund(p) by payment state (SPEC §8). Refunds go only to the reply address from the paid memo
 * (I5), commit refund_sending before sending (I3), and never resend money blindly: a resume
 * looks for its own "ref <txid8>" send first, and holds the payment if it can't look.
 */
export async function processRefund(d: EngineDeps, key: string): Promise<void> {
  const p = d.store.getPayment(key);
  if (!p) return;
  try {
    if (p.state === "refund_pending") return await sendRefund(d, p);
    if (p.state === "refund_sending") return await resumeRefund(d, p);
  } catch (e) {
    const now = d.now();
    const fresh = d.store.getPayment(key)!;
    d.store.updatePayment(key, { next_attempt_at: backoffAt(now, fresh.attempts, d.random), updated_at: now });
    d.store.addEvent(now, "retry", { orderId: p.order_id, paymentKey: key }, `refund: ${errMsg(e)}`);
  }
}

function hold(d: EngineDeps, p: PaymentRow, reason: string): void {
  const now = d.now();
  d.store.tx(() => {
    d.store.updatePayment(p.key, { state: "held", reason, updated_at: now });
    if (p.order_id && d.store.getOrder(p.order_id) && !ORDER_UNTOUCHED.has(reasonCode(p.reason))) d.store.setOrderStatus(p.order_id, "held", now);
    d.store.addEvent(now, "held", { orderId: p.order_id, paymentKey: p.key }, reason);
  });
}

async function sendRefund(d: EngineDeps, p: PaymentRow): Promise<void> {
  if (!p.reply_ua || !p.order_id) return hold(d, p, "refund_needs_review");
  const memo = buildRefundMemo({
    orderId: p.order_id,
    reasonText: reasonText(p.reason),
    amountZat: p.amount_zat,
    purchaseFailed: PURCHASE_FAILED_REASONS.has(reasonCode(p.reason)),
    payingTxid: p.txid,
  });
  const now = d.now();
  // COMMIT refund_sending and the attempt BEFORE the money moves (I3).
  d.store.updatePayment(p.key, { state: "refund_sending", attempts: p.attempts + 1, send_started_at: now, updated_at: now });
  d.store.addEvent(now, "refund_sending", { orderId: p.order_id, paymentKey: p.key }, `${p.amount_zat} zat, reason ${reasonCode(p.reason)}`);
  // The shop pays the fee from its float; the buyer gets the full amount back.
  let txid: string;
  try {
    ({ txid } = await d.wallet.send(p.reply_ua, p.amount_zat, memo));
  } catch (e) {
    // Refused before anything was broadcast: back to refund_pending, retried on normal backoff.
    if (e instanceof SendNotBroadcastError) d.store.updatePayment(p.key, { state: "refund_pending", send_started_at: null, updated_at: d.now() });
    throw e;
  }
  finishRefund(d, p, txid);
}

function finishRefund(d: EngineDeps, p: PaymentRow, txid: string): void {
  const now = d.now();
  d.store.tx(() => {
    d.store.updatePayment(p.key, { state: "refunded", refund_txid: txid, updated_at: now });
    if (p.order_id && d.store.getOrder(p.order_id) && !ORDER_UNTOUCHED.has(reasonCode(p.reason))) {
      d.store.setOrderStatus(p.order_id, "refunded", now);
    }
    d.store.addEvent(now, "refunded", { orderId: p.order_id, paymentKey: p.key }, `refund txid ${txid}`);
  });
}

async function resumeRefund(d: EngineDeps, p: PaymentRow): Promise<void> {
  let sent;
  try {
    sent = await d.wallet.listSent();
  } catch (e) {
    if (e instanceof NotSupportedError) return hold(d, p, "refund_needs_review"); // can't look, so never resend
    throw e;
  }
  const hit = sent.find(
    (s) => s.memo !== null && s.memo.includes(refundTag(p.txid)) && s.memo.includes(`Chupke #${p.order_id} refund`) && s.amountZat === p.amount_zat,
  );
  if (hit) return finishRefund(d, p, hit.txid);
  const now = d.now();
  if (p.send_started_at !== null && now - p.send_started_at < d.cfg.resendGuardMs) {
    d.store.updatePayment(p.key, { next_attempt_at: p.send_started_at + d.cfg.resendGuardMs, updated_at: now });
    return;
  }
  d.store.addEvent(now, "refund_resend", { orderId: p.order_id, paymentKey: p.key }, "no refund found in listSent; sending again");
  await sendRefund(d, p);
}
