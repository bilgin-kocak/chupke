import { parsePaymentMemo } from "../zcash/memo.js";
import { errMsg, type EngineDeps } from "./deps.js";
import { advanceFulfillment } from "./fulfill.js";
import { processRefund } from "./refund.js";
import { routePayment } from "./route.js";

/** How many state steps one fulfillment may take inside a single tick (create → pay → poll → send). */
const MAX_STEPS_PER_TICK = 6;

export interface TickReport {
  ms: number;
  ingested: number;
  routed: number;
  advanced: number;
  refunds: number;
  expired: number;
  errors: string[];
}

/**
 * The worker loop body (SPEC §8): sync, ingest, confirm, route, advance fulfillments, refunds,
 * expire, kv snapshots, purge. Each step is isolated so one failure doesn't block the others.
 */
export class Engine {
  private ingestFromHeight = 0;
  private lastBitrefillBalanceAt = Number.NEGATIVE_INFINITY;
  private lastError = "";

  constructor(private readonly d: EngineDeps) {}

  /** Decide which outputs are ours to process: those mined at or after the first start (or a set height). */
  async init(): Promise<{ shopUa: string; ingestFromHeight: number }> {
    const { store, wallet, cfg } = this.d;
    const now = this.d.now();
    const shopUa = await wallet.primaryAddress();
    store.kvSet("shop_ua", shopUa, now);
    const saved = store.kvGet("ingest_from_height");
    let h = cfg.ingestFromHeight ?? (saved ? Number(saved.v) : undefined);
    if (h === undefined) h = (await wallet.info()).chainHeight;
    if (!saved || Number(saved.v) !== h) store.kvSet("ingest_from_height", String(h), now);
    this.ingestFromHeight = h;
    return { shopUa, ingestFromHeight: h };
  }

  async tick(): Promise<TickReport> {
    const t0 = this.d.now();
    const report: TickReport = { ms: 0, ingested: 0, routed: 0, advanced: 0, refunds: 0, expired: 0, errors: [] };
    const steps: Array<[string, () => Promise<void> | void]> = [
      ["sync", () => this.d.wallet.sync()],
      ["ingest", async () => void (report.ingested = await this.ingest())],
      ["confirm", () => this.confirm()],
      ["route", () => void (report.routed = this.route())],
      ["fulfill", async () => void (report.advanced = await this.fulfill())],
      ["refund", async () => void (report.refunds = await this.refunds())],
      ["expire", () => void (report.expired = this.expire())],
      ["snapshot", () => this.snapshot()],
      ["purge", () => this.purge()],
    ];
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (e) {
        const msg = `${name}: ${errMsg(e)}`;
        report.errors.push(msg);
        this.d.log.error({ step: name, err: errMsg(e) }, "tick step failed");
        if (msg !== this.lastError) this.d.store.addEvent(this.d.now(), "tick_error", {}, msg);
        this.lastError = msg;
      }
    }
    if (report.errors.length === 0) this.lastError = "";
    const now = this.d.now();
    this.d.store.kvSet("last_tick_at", String(now), now);
    report.ms = now - t0;
    return report;
  }

  /** Step 2: INSERT OR IGNORE every received output (I1); refresh confirmations of known ones. */
  async ingest(): Promise<number> {
    const { store, wallet } = this.d;
    const outputs = await wallet.listIncoming();
    const now = this.d.now();
    let added = 0;
    for (const o of outputs) {
      if (o.minedHeight !== null && o.minedHeight < this.ingestFromHeight) continue;
      const parsed = parsePaymentMemo(o.memo);
      const isNew = store.insertPaymentIfNew({
        key: o.key,
        txid: o.txid,
        pool: o.pool,
        output_index: o.outputIndex,
        order_id: parsed?.orderId ?? null,
        amount_zat: o.amountZat,
        memo_ok: parsed ? 1 : 0,
        reply_ua: parsed?.replyUa ?? null,
        first_seen_at: now,
        mined_height: o.minedHeight,
        confirmations: o.confirmations,
        state: "seen",
        reason: null,
        refund_txid: null,
        attempts: 0,
        next_attempt_at: 0,
        send_started_at: null,
        updated_at: now,
      });
      if (isNew) {
        added++;
        store.addEvent(now, "payment_seen", { orderId: parsed?.orderId ?? null, paymentKey: o.key }, `${o.amountZat} zat, ${o.pool}, ${o.confirmations} conf`);
      } else {
        const p = store.getPayment(o.key)!;
        if (p.confirmations !== o.confirmations || p.mined_height !== o.minedHeight) {
          store.updatePayment(o.key, { confirmations: o.confirmations, mined_height: o.minedHeight, updated_at: now });
        }
      }
    }
    return added;
  }

  /** Step 3: seen -> confirmed once confirmations >= MIN_CONFIRMATIONS. */
  confirm(): void {
    const { store, cfg } = this.d;
    const now = this.d.now();
    for (const p of store.paymentsInState("seen")) {
      if (p.confirmations >= cfg.minConfirmations) {
        store.updatePayment(p.key, { state: "confirmed", updated_at: now });
        store.addEvent(now, "payment_confirmed", { orderId: p.order_id, paymentKey: p.key }, `${p.confirmations} conf at height ${p.mined_height}`);
      }
    }
  }

  /** Step 4: route each confirmed payment, one transaction each. */
  route(): number {
    const list = this.d.store.paymentsInState("confirmed");
    for (const p of list) routePayment(this.d, p.key);
    return list.length;
  }

  /** Step 5: advance due fulfillments, letting each move several states in one tick. */
  async fulfill(): Promise<number> {
    let advanced = 0;
    for (const f of this.d.store.dueFulfillments(this.d.now())) {
      for (let i = 0; i < MAX_STEPS_PER_TICK; i++) {
        const before = this.d.store.getFulfillment(f.order_id)!;
        if (before.next_attempt_at > this.d.now()) break;
        await advanceFulfillment(this.d, f.order_id);
        advanced++;
        const after = this.d.store.getFulfillment(f.order_id)!;
        if (after.state === before.state || after.state === "memo_sent" || after.state === "failed") break;
      }
    }
    return advanced;
  }

  /** Step 6: process due refunds. */
  async refunds(): Promise<number> {
    const due = this.d.store.dueRefunds(this.d.now());
    for (const p of due) await processRefund(this.d, p.key);
    return due.length;
  }

  /** Step 7: expire unpaid orders past expires_at + GRACE_MIN. */
  expire(): number {
    const now = this.d.now();
    const ids = this.d.store.expireOrders(now, this.d.cfg.graceMin * 60_000);
    for (const id of ids) this.d.store.addEvent(now, "expired", { orderId: id }, "no payment before the quote expired");
    return ids.length;
  }

  /** Step 8: kv snapshots for the dashboard (Bitrefill balance at most every few minutes). */
  async snapshot(): Promise<void> {
    const { store, wallet, bitrefill, cfg } = this.d;
    const now = this.d.now();
    const bal = await wallet.balance();
    store.kvSet("wallet_balance", JSON.stringify(bal), now);
    const info = await wallet.info();
    store.kvSet("chain_height", String(info.chainHeight), now);
    store.kvSet("wallet_height", String(info.walletHeight), now);
    if (now - this.lastBitrefillBalanceAt >= cfg.bitrefillBalanceEveryMs) {
      this.lastBitrefillBalanceAt = now;
      store.kvSet("bitrefill_balance", JSON.stringify(await bitrefill.balance()), now);
    }
  }

  /** Step 9: purge reply addresses from old terminal orders (I7). */
  purge(): void {
    const now = this.d.now();
    const n = this.d.store.purgeReplyAddresses(now, this.d.cfg.purgeAfterMin * 60_000);
    if (n.orders + n.payments > 0) this.d.store.addEvent(now, "purged", {}, `reply addresses removed: ${n.orders} order(s), ${n.payments} payment(s)`);
  }
}
