import type { PaymentRow } from "../db/store.js";
import { type EngineDeps } from "./deps.js";
import { guard, istDayStart } from "./guard.js";

/**
 * route(p) for one confirmed payment, in one DB transaction, checks in SPEC §8 order:
 * dust, unparseable memo, missing order, duplicate, expired quote, guard, accept.
 */
export function routePayment(d: EngineDeps, key: string): void {
  const now = d.now();
  d.store.tx(() => {
    const p = d.store.getPayment(key);
    if (!p || p.state !== "confirmed") return; // already routed
    const ref = { orderId: p.order_id, paymentKey: p.key };
    const set = (state: PaymentRow["state"], reason: string | null) =>
      d.store.updatePayment(p.key, { state, reason, next_attempt_at: now, updated_at: now });

    if (p.amount_zat < d.cfg.dustZat) {
      set("ignored_dust", null);
      d.store.addEvent(now, "ignored_dust", ref, `amount ${p.amount_zat} zat`);
      return;
    }
    if (!p.memo_ok || !p.order_id || !p.reply_ua) {
      set("held", "no_reply_address");
      d.store.addEvent(now, "held", ref, "no_reply_address");
      return;
    }
    const order = d.store.getOrder(p.order_id);
    if (!order) {
      set("refund_pending", "unknown_order");
      d.store.addEvent(now, "refund_pending", ref, "unknown_order");
      return;
    }
    if (d.store.getFulfillment(order.id)) {
      set("refund_pending", "duplicate_payment");
      d.store.addEvent(now, "duplicate_skipped", ref, "order already has a fulfillment");
      return;
    }
    if (p.first_seen_at > order.expires_at + d.cfg.graceMin * 60_000) {
      set("refund_pending", "quote_expired");
      d.store.addEvent(now, "refund_pending", ref, "quote_expired");
      return;
    }
    const verdict = guard({
      pausePurchases: d.cfg.pausePurchases,
      allowRealPurchases: d.cfg.allowRealPurchases,
      maxOrderUsd: d.cfg.maxOrderUsd,
      maxDailyUsd: d.cfg.maxDailyUsd,
      dailyCapIncludesTest: d.cfg.dailyCapIncludesTest,
      todaySpendUsd: d.store.committedSpendUsd(istDayStart(now), d.cfg.dailyCapIncludesTest),
      amountZat: p.amount_zat,
      order,
      entry: d.allowlist.find((e) => e.sku === order.sku),
    });
    if (!verdict.ok) {
      set("refund_pending", verdict.code);
      d.store.addEvent(now, "refund_pending", ref, `guard: ${verdict.code}`);
      return;
    }
    d.store.insertFulfillment({
      order_id: order.id,
      payment_key: p.key,
      state: "claimed",
      invoice_id: null,
      br_order_ids: null,
      invoice_status: null,
      delivery_txid: null,
      error: null,
      attempts: 0,
      next_attempt_at: now,
      created_at: now,
      spend_at: null,
      send_started_at: null,
      updated_at: now,
    });
    set("accepted", null);
    d.store.setOrderStatus(order.id, "fulfilling", now);
    d.store.addEvent(now, "accepted", ref, `${p.amount_zat} zat for ${order.sku}`);
  });
}
