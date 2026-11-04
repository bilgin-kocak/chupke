import { scrub } from "../log.js";
import type { DB } from "./schema.js";

export type OrderStatus = "awaiting_payment" | "fulfilling" | "delivered" | "refunded" | "expired" | "held";
export type PaymentState = "seen" | "confirmed" | "accepted" | "refund_pending" | "refund_sending" | "refunded" | "held" | "ignored_dust";
export type FulfillmentState =
  | "claimed"
  | "invoice_created"
  | "paying"
  | "paid"
  | "delivered"
  | "delivery_sending"
  | "memo_sent"
  | "failed";

export interface OrderRow {
  id: string;
  sku: string;
  kind: "test" | "real";
  product_id: string;
  package_id: string | null;
  value: number | null;
  value_usd: number;
  label: string;
  price_zat: number;
  reply_ua: string | null;
  created_at: number;
  expires_at: number;
  status: OrderStatus;
  terminal_at: number | null;
  updated_at: number;
}

export interface PaymentRow {
  key: string;
  txid: string;
  pool: string;
  output_index: number | null;
  order_id: string | null;
  amount_zat: number;
  memo_ok: number;
  reply_ua: string | null;
  first_seen_at: number;
  mined_height: number | null;
  confirmations: number;
  state: PaymentState;
  reason: string | null;
  refund_txid: string | null;
  attempts: number;
  next_attempt_at: number;
  send_started_at: number | null;
  updated_at: number;
}

export interface FulfillmentRow {
  order_id: string;
  payment_key: string;
  state: FulfillmentState;
  invoice_id: string | null;
  br_order_ids: string | null;
  invoice_status: string | null;
  delivery_txid: string | null;
  error: string | null;
  attempts: number;
  next_attempt_at: number;
  created_at: number;
  spend_at: number | null;
  send_started_at: number | null;
  updated_at: number;
}

export interface EventRow {
  id: number;
  at: number;
  order_id: string | null;
  payment_key: string | null;
  type: string;
  detail: string | null;
}

const TERMINAL_ORDER: OrderStatus[] = ["delivered", "refunded", "expired", "held"];
const OPEN_FULFILLMENT: FulfillmentState[] = ["claimed", "invoice_created", "paying", "paid", "delivered", "delivery_sending"];
/** Spend that is committed or done: in-flight claims count too, so two orders in one tick can't both pass the cap. */
const SPEND_FULFILLMENT: FulfillmentState[] = ["claimed", "invoice_created", "paying", "paid", "delivered", "delivery_sending", "memo_sent"];

type Patch<T> = Partial<Omit<T, "key" | "id" | "order_id">>;

function setClause(patch: Record<string, unknown>): { sql: string; values: unknown[] } {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new Error("empty patch");
  return { sql: keys.map((k) => `${k} = ?`).join(", "), values: keys.map((k) => patch[k]) };
}

export class Store {
  constructor(readonly db: DB) {}

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---- orders -------------------------------------------------------------------------------

  insertOrder(o: OrderRow): void {
    this.db
      .prepare(
        `INSERT INTO orders (id, sku, kind, product_id, package_id, value, value_usd, label, price_zat, reply_ua,
           created_at, expires_at, status, terminal_at, updated_at)
         VALUES (@id, @sku, @kind, @product_id, @package_id, @value, @value_usd, @label, @price_zat, @reply_ua,
           @created_at, @expires_at, @status, @terminal_at, @updated_at)`,
      )
      .run(o);
  }

  getOrder(id: string): OrderRow | undefined {
    return this.db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as OrderRow | undefined;
  }

  /** terminal_at is set on entering a terminal status and cleared when an order becomes live again. */
  setOrderStatus(id: string, status: OrderStatus, now: number): void {
    const terminal = TERMINAL_ORDER.includes(status) ? 1 : 0;
    this.db
      .prepare(
        `UPDATE orders SET status = ?, terminal_at = CASE WHEN ? = 1 THEN COALESCE(terminal_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?`,
      )
      .run(status, terminal, now, now, id);
  }

  /** Unpaid orders past expires_at + grace with no payment at all. */
  expireOrders(now: number, graceMs: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT id FROM orders o WHERE o.status = 'awaiting_payment' AND o.expires_at + ? < ?
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)`,
      )
      .all(graceMs, now) as Array<{ id: string }>;
    for (const r of rows) this.setOrderStatus(r.id, "expired", now);
    return rows.map((r) => r.id);
  }

  /** I7: drop reply addresses PURGE_AFTER_MIN after the order (or payment) is terminal. */
  purgeReplyAddresses(now: number, purgeAfterMs: number): { orders: number; payments: number } {
    const cutoff = now - purgeAfterMs;
    const orders = this.db
      .prepare(`UPDATE orders SET reply_ua = NULL WHERE reply_ua IS NOT NULL AND terminal_at IS NOT NULL AND terminal_at < ?`)
      .run(cutoff).changes;
    const payments = this.db
      .prepare(
        `UPDATE payments SET reply_ua = NULL WHERE reply_ua IS NOT NULL AND updated_at < ? AND (
           state IN ('refunded', 'ignored_dust')
           OR (state = 'accepted' AND order_id IN (SELECT id FROM orders WHERE terminal_at IS NOT NULL AND terminal_at < ?))
           OR (state = 'held' AND COALESCE(reason, '') <> 'refund_needs_review'))`,
      )
      .run(cutoff, cutoff).changes;
    return { orders, payments };
  }

  // ---- payments -----------------------------------------------------------------------------

  /** I1: INSERT OR IGNORE on the output key. Returns true when the row is new. */
  insertPaymentIfNew(p: PaymentRow): boolean {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO payments (key, txid, pool, output_index, order_id, amount_zat, memo_ok, reply_ua,
             first_seen_at, mined_height, confirmations, state, reason, refund_txid, attempts, next_attempt_at,
             send_started_at, updated_at)
           VALUES (@key, @txid, @pool, @output_index, @order_id, @amount_zat, @memo_ok, @reply_ua, @first_seen_at,
             @mined_height, @confirmations, @state, @reason, @refund_txid, @attempts, @next_attempt_at,
             @send_started_at, @updated_at)`,
        )
        .run(p).changes === 1
    );
  }

  getPayment(key: string): PaymentRow | undefined {
    return this.db.prepare(`SELECT * FROM payments WHERE key = ?`).get(key) as PaymentRow | undefined;
  }

  updatePayment(key: string, patch: Patch<PaymentRow>): void {
    const { sql, values } = setClause(patch);
    this.db.prepare(`UPDATE payments SET ${sql} WHERE key = ?`).run(...values, key);
  }

  paymentsInState(state: PaymentState): PaymentRow[] {
    return this.db.prepare(`SELECT * FROM payments WHERE state = ? ORDER BY first_seen_at, key`).all(state) as PaymentRow[];
  }

  dueRefunds(now: number): PaymentRow[] {
    return this.db
      .prepare(
        `SELECT * FROM payments WHERE state IN ('refund_pending', 'refund_sending') AND next_attempt_at <= ? ORDER BY first_seen_at, key`,
      )
      .all(now) as PaymentRow[];
  }

  paymentsForOrder(orderId: string): PaymentRow[] {
    return this.db.prepare(`SELECT * FROM payments WHERE order_id = ? ORDER BY first_seen_at, key`).all(orderId) as PaymentRow[];
  }

  // ---- fulfillments -------------------------------------------------------------------------

  insertFulfillment(f: FulfillmentRow): void {
    this.db
      .prepare(
        `INSERT INTO fulfillments (order_id, payment_key, state, invoice_id, br_order_ids, invoice_status, delivery_txid,
           error, attempts, next_attempt_at, created_at, spend_at, send_started_at, updated_at)
         VALUES (@order_id, @payment_key, @state, @invoice_id, @br_order_ids, @invoice_status, @delivery_txid, @error,
           @attempts, @next_attempt_at, @created_at, @spend_at, @send_started_at, @updated_at)`,
      )
      .run(f);
  }

  getFulfillment(orderId: string): FulfillmentRow | undefined {
    return this.db.prepare(`SELECT * FROM fulfillments WHERE order_id = ?`).get(orderId) as FulfillmentRow | undefined;
  }

  updateFulfillment(orderId: string, patch: Patch<FulfillmentRow>): void {
    const { sql, values } = setClause(patch);
    this.db.prepare(`UPDATE fulfillments SET ${sql} WHERE order_id = ?`).run(...values, orderId);
  }

  dueFulfillments(now: number): FulfillmentRow[] {
    const states = OPEN_FULFILLMENT.map(() => "?").join(",");
    return this.db
      .prepare(`SELECT * FROM fulfillments WHERE state IN (${states}) AND next_attempt_at <= ? ORDER BY created_at`)
      .all(...OPEN_FULFILLMENT, now) as FulfillmentRow[];
  }

  /** Today's committed spend in USD since `sinceMs` (IST day start), optionally excluding free test products. */
  committedSpendUsd(sinceMs: number, includeTest: boolean): number {
    const states = SPEND_FULFILLMENT.map(() => "?").join(",");
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(o.value_usd), 0) AS usd FROM fulfillments f JOIN orders o ON o.id = f.order_id
         WHERE f.state IN (${states}) AND COALESCE(f.spend_at, f.created_at) >= ? ${includeTest ? "" : "AND o.kind = 'real'"}`,
      )
      .get(...SPEND_FULFILLMENT, sinceMs) as { usd: number };
    return row.usd;
  }

  // ---- events and kv ------------------------------------------------------------------------

  /** Event detail is scrubbed of addresses and keys and capped; callers must never pass codes or memos. */
  addEvent(at: number, type: string, ref: { orderId?: string | null; paymentKey?: string | null } = {}, detail?: string): void {
    this.db
      .prepare(`INSERT INTO events (at, order_id, payment_key, type, detail) VALUES (?, ?, ?, ?, ?)`)
      .run(at, ref.orderId ?? null, ref.paymentKey ?? null, type, detail === undefined ? null : scrub(detail).slice(0, 300));
  }

  events(limit = 100, orderId?: string): EventRow[] {
    return orderId
      ? (this.db.prepare(`SELECT * FROM events WHERE order_id = ? ORDER BY id DESC LIMIT ?`).all(orderId, limit) as EventRow[])
      : (this.db.prepare(`SELECT * FROM events ORDER BY id DESC LIMIT ?`).all(limit) as EventRow[]);
  }

  kvSet(k: string, v: string, now: number): void {
    this.db
      .prepare(`INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`)
      .run(k, v, now);
  }

  kvGet(k: string): { v: string; updated_at: number } | undefined {
    return this.db.prepare(`SELECT v, updated_at FROM kv WHERE k = ?`).get(k) as { v: string; updated_at: number } | undefined;
  }
}
