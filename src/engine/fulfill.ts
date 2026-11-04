import { BitrefillError, allOrdersDelivered, invoiceFailed, invoiceUnpaid, type Invoice } from "../bitrefill/client.js";
import { hasRedeemable, normalizeRedemption } from "../bitrefill/redemption.js";
import type { FulfillmentRow, OrderRow, PaymentRow } from "../db/store.js";
import { buildDeliveryMemo, deliveryTag } from "../zcash/memo.js";
import { NotSupportedError, SendNotBroadcastError } from "../zcash/wallet.js";
import { backoffAt, errMsg, type EngineDeps } from "./deps.js";

/** A paid order that is neither delivered nor a known failure after this long gets a "stuck" event. */
const STUCK_AFTER_MS = 15 * 60_000;

/**
 * advance(f) by fulfillment state (SPEC §8). Every money-moving call (pay, wallet send) is preceded
 * by a committed state change (I3); resumes look before they act. Redemption codes exist only in
 * memory between getOrder and the wallet send (I6).
 */
export async function advanceFulfillment(d: EngineDeps, orderId: string): Promise<void> {
  const f = d.store.getFulfillment(orderId);
  if (!f) return;
  const order = d.store.getOrder(orderId);
  const payment = d.store.getPayment(f.payment_key);
  if (!order || !payment) throw new Error(`fulfillment ${orderId} is missing its order or payment`);
  const ctx = { d, f, order, payment };
  try {
    switch (f.state) {
      case "claimed":
        return await createInvoice(ctx);
      case "invoice_created":
        return await startPaying(ctx);
      case "paying":
        return await resumePaying(ctx);
      case "paid":
        return await pollInvoice(ctx);
      case "delivered":
        return await startDelivery(ctx);
      case "delivery_sending":
        return await resumeDelivery(ctx);
      default:
        return;
    }
  } catch (e) {
    // Transient or unexpected: stay in the current state and back off.
    const now = d.now();
    const fresh = d.store.getFulfillment(orderId)!;
    d.store.updateFulfillment(orderId, {
      attempts: fresh.attempts + 1,
      next_attempt_at: backoffAt(now, fresh.attempts, d.random),
      error: errMsg(e).slice(0, 200),
      updated_at: now,
    });
    d.store.addEvent(now, e instanceof BitrefillError && e.status === 429 ? "rate_limited" : "retry", { orderId }, `${fresh.state}: ${errMsg(e)}`);
  }
}

interface Ctx {
  d: EngineDeps;
  f: FulfillmentRow;
  order: OrderRow;
  payment: PaymentRow;
}

/** Fail the purchase and queue a full refund of the paying output, atomically. */
function failAndRefund({ d, order, payment }: Ctx, reason: string): void {
  const now = d.now();
  d.store.tx(() => {
    d.store.updateFulfillment(order.id, { state: "failed", error: reason, updated_at: now });
    d.store.updatePayment(payment.key, { state: "refund_pending", reason, attempts: 0, next_attempt_at: now, updated_at: now });
    d.store.addEvent(now, "failed", { orderId: order.id, paymentKey: payment.key }, reason);
  });
}

function markPaid({ d, order }: Ctx, inv: Invoice): void {
  const now = d.now();
  d.store.updateFulfillment(order.id, {
    state: "paid",
    invoice_status: inv.status,
    attempts: 0,
    error: null,
    next_attempt_at: now,
    updated_at: now,
  });
  d.store.addEvent(now, "paid", { orderId: order.id }, `invoice ${inv.id} payment ${inv.payment?.status ?? "?"}`);
}

async function createInvoice(c: Ctx): Promise<void> {
  const { d, order } = c;
  const line = order.package_id
    ? { product_id: order.product_id, package_id: order.package_id, quantity: 1 }
    : { product_id: order.product_id, value: order.value ?? undefined, quantity: 1 };
  let inv: Invoice;
  try {
    // Moves no money (I4): repeating it after a crash only leaves an orphan invoice that expires unpaid.
    inv = await d.bitrefill.createInvoice({ products: [line], payment_method: "balance", auto_pay: false });
  } catch (e) {
    if (e instanceof BitrefillError && e.kind === "http" && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 429) {
      return failAndRefund(c, `bitrefill_rejected:${e.errorCode ?? e.status}`);
    }
    throw e;
  }
  const now = d.now();
  d.store.updateFulfillment(order.id, {
    state: "invoice_created",
    invoice_id: inv.id,
    br_order_ids: JSON.stringify(inv.orders.map((o) => o.id)),
    invoice_status: inv.status,
    attempts: 0,
    error: null,
    next_attempt_at: now,
    updated_at: now,
  });
  d.store.addEvent(now, "invoice_created", { orderId: order.id }, `invoice ${inv.id}`);
}

async function startPaying(c: Ctx): Promise<void> {
  const { d, f, order } = c;
  const now = d.now();
  // COMMIT "paying" FIRST (I3).
  d.store.updateFulfillment(order.id, { state: "paying", spend_at: f.spend_at ?? now, updated_at: now });
  d.store.addEvent(now, "paying", { orderId: order.id }, `invoice ${f.invoice_id}`);
  await pay(c);
}

async function pay(c: Ctx): Promise<void> {
  const { d, f } = c;
  try {
    markPaid(c, await d.bitrefill.payInvoice(f.invoice_id!));
  } catch (e) {
    if (!(e instanceof BitrefillError) || e.transient) throw e; // stay "paying"; the resume looks first
    if (e.status === 403) return failAndRefund(c, "shop_out_of_credit");
    // 404 means "not found or already paid", and other 4xx are ambiguous: ask the invoice.
    const inv = await d.bitrefill.getInvoice(f.invoice_id!);
    if (invoiceUnpaid(inv)) return failAndRefund(c, "invoice_not_payable");
    markPaid(c, inv);
  }
}

async function resumePaying(c: Ctx): Promise<void> {
  const { d, f } = c;
  // Resume: getInvoice FIRST; never create a new invoice here.
  const inv = await d.bitrefill.getInvoice(f.invoice_id!);
  if (invoiceUnpaid(inv)) return pay(c);
  markPaid(c, inv);
}

async function pollInvoice(c: Ctx): Promise<void> {
  const { d, f, order } = c;
  const inv = await d.bitrefill.getInvoice(f.invoice_id!);
  const now = d.now();
  if (allOrdersDelivered(inv)) {
    d.store.updateFulfillment(order.id, {
      state: "delivered",
      invoice_status: inv.status,
      br_order_ids: JSON.stringify(inv.orders.map((o) => o.id)),
      attempts: 0,
      error: null,
      next_attempt_at: now,
      updated_at: now,
    });
    d.store.addEvent(now, "delivered", { orderId: order.id }, `invoice ${inv.id}: ${inv.orders.length} order(s) delivered`);
    return;
  }
  if (invoiceFailed(inv)) return failAndRefund(c, "bitrefill_order_failed");
  const paidFor = now - (f.spend_at ?? f.created_at);
  if (paidFor > STUCK_AFTER_MS && !(f.error ?? "").startsWith("stuck")) {
    // Not delivered and not a failure we know: keep polling (it may still deliver), but say so once.
    d.store.addEvent(now, "stuck", { orderId: order.id }, `paid ${Math.round(paidFor / 60_000)} min ago; invoice ${inv.status}, orders ${inv.orders.map((o) => o.status).join(",")}`);
    d.store.updateFulfillment(order.id, { error: `stuck: invoice ${inv.status}` });
  }
  d.store.updateFulfillment(order.id, { invoice_status: inv.status, next_attempt_at: now + d.cfg.invoicePollMs, updated_at: now });
}

async function startDelivery(c: Ctx): Promise<void> {
  const { d, order } = c;
  const now = d.now();
  // COMMIT "delivery_sending" FIRST.
  d.store.updateFulfillment(order.id, { state: "delivery_sending", send_started_at: null, updated_at: now });
  await sendDelivery(c);
}

async function sendDelivery(c: Ctx): Promise<void> {
  const { d, f, order, payment } = c;
  const replyUa = payment.reply_ua; // I5: only the address from the paid memo
  if (!replyUa) throw new Error("reply address missing for delivery");
  const ids = JSON.parse(f.br_order_ids ?? "[]") as string[];
  if (ids.length !== 1) throw new Error(`expected one Bitrefill order, got ${ids.length}`);
  const brOrder = await d.bitrefill.getOrder(ids[0]!);
  const r = normalizeRedemption(brOrder.redemption_info);
  if (!hasRedeemable(r)) throw new Error("Bitrefill order has no code or link yet");
  const memo = buildDeliveryMemo({ orderId: order.id, label: order.label, code: r.code, pin: r.pin, link: r.link });

  const startedAt = d.now();
  d.store.updateFulfillment(order.id, { send_started_at: startedAt, attempts: f.attempts + 1, updated_at: startedAt });
  let txid: string;
  try {
    ({ txid } = await d.wallet.send(replyUa, d.cfg.deliveryAmountZat, memo));
  } catch (e) {
    // Nothing went out (e.g. change not spendable yet): retry on normal backoff, no listSent wait.
    if (e instanceof SendNotBroadcastError) d.store.updateFulfillment(order.id, { send_started_at: null });
    throw e;
  }
  finishDelivery(c, txid);
}

function finishDelivery({ d, order }: Ctx, txid: string): void {
  const now = d.now();
  d.store.tx(() => {
    d.store.updateFulfillment(order.id, { state: "memo_sent", delivery_txid: txid, attempts: 0, error: null, updated_at: now });
    d.store.setOrderStatus(order.id, "delivered", now);
    d.store.addEvent(now, "memo_sent", { orderId: order.id }, `delivery txid ${txid}`);
  });
}

async function resumeDelivery(c: Ctx): Promise<void> {
  const { d, f, order } = c;
  if (f.send_started_at === null) return sendDelivery(c); // no send was ever attempted
  // A send may have gone out: look for our own tag before sending again.
  try {
    const hit = (await d.wallet.listSent()).find((s) => s.memo?.includes(deliveryTag(order.id)));
    if (hit) return finishDelivery(c, hit.txid);
  } catch (e) {
    if (!(e instanceof NotSupportedError)) throw e;
  }
  const now = d.now();
  if (now - f.send_started_at < d.cfg.resendGuardMs) {
    d.store.updateFulfillment(order.id, { next_attempt_at: f.send_started_at + d.cfg.resendGuardMs, updated_at: now });
    return;
  }
  d.store.addEvent(now, "delivery_resend", { orderId: order.id }, "no delivery found in listSent; resending (a duplicate memo only costs a fee)");
  await sendDelivery(c);
}
