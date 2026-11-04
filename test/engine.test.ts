import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { BitrefillError, type CreateInvoiceRequest, type Invoice, type Order } from "../src/bitrefill/client.js";
import type { AllowlistEntry } from "../src/config.js";
import { openDb } from "../src/db/schema.js";
import { Store } from "../src/db/store.js";
import type { BitrefillPort, EngineConfig } from "../src/engine/deps.js";
import { Engine } from "../src/engine/tick.js";
import { createLogger } from "../src/log.js";
import { createOrder } from "../src/orders.js";
import { buildPaymentMemo, deliveryTag } from "../src/zcash/memo.js";
import { NotSupportedError, SendNotBroadcastError, paymentKey, type IncomingOutput, type SentOutput, type ZcashWallet } from "../src/zcash/wallet.js";
import { fakeUa } from "./helpers.js";

const ALLOWLIST: AllowlistEntry[] = [
  { sku: "test-ok", kind: "test", label: "Test gift card", product_id: "test-gift-card-code", package_id: "test-gift-card-code<&>10", value_usd: 10 },
  { sku: "test-fail", kind: "test", label: "Test gift card (fails)", product_id: "test-gift-card-code-fail", package_id: "test-gift-card-code-fail<&>10", value_usd: 10 },
];
const SHOP_UA = fakeUa();
const CODE_PREFIX = "SECRETCODE";

class FakeWallet implements ZcashWallet {
  incoming: IncomingOutput[] = [];
  sent: Array<SentOutput & { to: string }> = [];
  sends = 0;
  listSentSupported = true;
  /**
   * Throw on the next send. "before" = unknown failure before broadcast, "after" = the tx went out but
   * the call failed (lost response / crash), "reject" = refused at proposal (nothing broadcast, known).
   */
  failNextSend: "before" | "after" | "reject" | null = null;
  async info() {
    return { chainHeight: 1000, walletHeight: 1000 };
  }
  async sync() {}
  async primaryAddress() {
    return SHOP_UA;
  }
  async balance() {
    return { spendableZat: 100_000_000, totalZat: 100_000_000 };
  }
  async listIncoming() {
    return this.incoming.map((o) => ({ ...o }));
  }
  async listSent() {
    if (!this.listSentSupported) throw new NotSupportedError("listSent");
    return this.sent.map((s) => ({ ...s }));
  }
  async send(to: string, amountZat: number, memo: string) {
    this.sends++;
    const txid = randomBytes(32).toString("hex");
    if (this.failNextSend === "before") {
      this.failNextSend = null;
      throw new Error("send failed before broadcast");
    }
    if (this.failNextSend === "reject") {
      this.failNextSend = null;
      throw new SendNotBroadcastError("quicksend", 1, "Propose send error: Insufficient balance");
    }
    this.sent.push({ txid, to, amountZat, memo });
    if (this.failNextSend === "after") {
      this.failNextSend = null;
      throw new Error("process crashed after broadcast");
    }
    return { txid };
  }
}

class FakeBitrefill implements BitrefillPort {
  invoices = new Map<string, Invoice & { orderProduct: string }>();
  createCalls = 0;
  payCalls = 0;
  /** One-shot behaviors. */
  crashAfterCreate = false;
  crashAfterPay = false;
  pay404AfterPaying = false;
  createError: BitrefillError | null = null;
  async createInvoice(req: CreateInvoiceRequest): Promise<Invoice> {
    this.createCalls++;
    if (this.createError) throw this.createError;
    const id = `inv_${this.createCalls}`;
    const inv = {
      id,
      status: "not_delivered",
      payment: { status: "unpaid", price: 13441, currency: "BTC" },
      orders: [{ id: `ord_${this.createCalls}`, status: "created" }],
      orderProduct: req.products[0]!.product_id,
    };
    this.invoices.set(id, inv);
    if (this.crashAfterCreate) {
      this.crashAfterCreate = false;
      throw new Error("network dropped after invoice was created");
    }
    return structuredClone(inv);
  }
  async payInvoice(id: string): Promise<Invoice> {
    const inv = this.invoices.get(id);
    if (!inv || inv.payment!.status !== "unpaid") throw new BitrefillError("http", 404, null, "not found or already paid");
    this.payCalls++;
    const fails = inv.orderProduct.endsWith("-fail");
    inv.payment = { status: "complete", price: 13441, currency: "BTC" };
    // Live shapes (2026-11-04): success "all_delivered"/"delivered", failure "all_error"/"permanent_failure".
    inv.status = fails ? "all_error" : "all_delivered";
    inv.orders = inv.orders.map((o) => ({ ...o, status: fails ? "permanent_failure" : "delivered" }));
    if (this.crashAfterPay) {
      this.crashAfterPay = false;
      throw new BitrefillError("network", null, null, "network error after paying");
    }
    if (this.pay404AfterPaying) {
      this.pay404AfterPaying = false;
      throw new BitrefillError("http", 404, null, "not found or already paid");
    }
    return structuredClone(inv);
  }
  async getInvoice(id: string): Promise<Invoice> {
    const inv = this.invoices.get(id);
    if (!inv) throw new BitrefillError("http", 404, null, "no such invoice");
    return structuredClone(inv);
  }
  async getOrder(id: string): Promise<Order> {
    return { id, status: "delivered", redemption_info: { code: `${CODE_PREFIX}-${id}`, pin: null, link: null, instructions: "Use it" } };
  }
  async balance() {
    return { balance: 0, currency: "BTC" };
  }
}

const CFG: EngineConfig = {
  minConfirmations: 1,
  dustZat: 20_000,
  graceMin: 10,
  pausePurchases: false,
  allowRealPurchases: false,
  maxOrderUsd: 10,
  maxDailyUsd: 30,
  dailyCapIncludesTest: false,
  deliveryAmountZat: 1_000,
  purgeAfterMin: 60,
  resendGuardMs: 180_000,
  invoicePollMs: 8_000,
  bitrefillBalanceEveryMs: 300_000,
};

function harness(cfg: Partial<EngineConfig> = {}) {
  const store = new Store(openDb(":memory:"));
  const wallet = new FakeWallet();
  const br = new FakeBitrefill();
  const logs: string[] = [];
  const log = createLogger({
    level: "debug",
    destination: new Writable({
      write(chunk: Buffer, _e, cb) {
        logs.push(chunk.toString());
        cb();
      },
    }),
  });
  let t = Date.parse("2026-11-04T08:00:00Z");
  const engine = new Engine({ store, wallet, bitrefill: br, allowlist: ALLOWLIST, cfg: { ...CFG, ...cfg }, now: () => t, log, random: () => 0 });
  const h = {
    store,
    wallet,
    br,
    logs,
    engine,
    advance: (ms: number) => void (t += ms),
    order(sku = "test-ok", replyUa = fakeUa()) {
      const r = createOrder(store, ALLOWLIST, { sku, replyUa }, { demoZatPerUsd: 100_000, orderTtlMin: 20, now: t });
      if (!r.ok) throw new Error(r.message);
      return r.order;
    },
    /** A received output paying `orderId`, with the reply address in its memo. */
    pay(orderId: string, amountZat: number, replyUa: string, opts: { txid?: string; index?: number; conf?: number } = {}) {
      const txid = opts.txid ?? randomBytes(32).toString("hex");
      const o = { txid, pool: "ironwood" as const, outputIndex: opts.index ?? 0, amountZat, memo: buildPaymentMemo(orderId, replyUa), minedHeight: 1001, confirmations: opts.conf ?? 1 };
      const out: IncomingOutput = { ...o, key: paymentKey(o) };
      wallet.incoming.push(out);
      return out;
    },
    async ticks(n: number, stepMs = 10_000) {
      for (let i = 0; i < n; i++) {
        await engine.tick();
        t += stepMs;
      }
    },
  };
  return h;
}

let h: ReturnType<typeof harness>;
beforeEach(async () => {
  h = harness();
  await h.engine.init();
});

describe("engine happy path", () => {
  it("buys once and delivers the code to the memo's reply address", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    await h.ticks(3);
    expect(h.br.createCalls).toBe(1);
    expect(h.br.payCalls).toBe(1);
    expect(h.wallet.sent).toHaveLength(1);
    const delivery = h.wallet.sent[0]!;
    expect(delivery.to).toBe(reply);
    expect(delivery.amountZat).toBe(1_000);
    expect(delivery.memo!.split("\n")[0]).toBe(deliveryTag(order.id));
    expect(delivery.memo).toContain(`Code: ${CODE_PREFIX}-ord_1`);
    expect(h.store.getOrder(order.id)!.status).toBe("delivered");
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
  });
});

describe("invariants (SPEC §13)", () => {
  it("1. the same note ingested twice -> one fulfillment", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const out = h.pay(order.id, order.price_zat, reply);
    await h.ticks(1);
    h.wallet.incoming.push({ ...out }); // a rescan returns the same output again
    await h.ticks(3);
    expect(h.store.paymentsForOrder(order.id)).toHaveLength(1);
    expect(h.br.createCalls).toBe(1);
    expect(h.br.payCalls).toBe(1);
    expect(h.wallet.sent).toHaveLength(1);
  });

  it("2. two payments for one order -> one fulfills, the other is refunded as duplicate_payment", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const a = h.pay(order.id, order.price_zat, reply);
    const b = h.pay(order.id, order.price_zat, reply);
    await h.ticks(4);
    expect(h.br.payCalls).toBe(1);
    const states = [h.store.getPayment(a.key)!, h.store.getPayment(b.key)!].map((p) => `${p.state}:${p.reason ?? ""}`).sort();
    expect(states).toEqual(["accepted:", "refunded:duplicate_payment"]);
    const refund = h.wallet.sent.find((s) => s.memo!.includes("refund"))!;
    expect(refund.amountZat).toBe(order.price_zat);
    expect(refund.memo).toContain("This order was already paid");
    expect(h.store.events(100).some((e) => e.type === "duplicate_skipped")).toBe(true);
    expect(h.store.getOrder(order.id)!.status).toBe("delivered"); // the duplicate doesn't touch the order
  });

  it("3. a crash after createInvoice but before the id is saved -> a new invoice, and exactly one pay", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    h.br.crashAfterCreate = true;
    await h.ticks(1);
    expect(h.store.getFulfillment(order.id)!.state).toBe("claimed");
    h.advance(60_000);
    await h.ticks(3);
    expect(h.br.createCalls).toBe(2);
    expect(h.br.payCalls).toBe(1);
    expect(h.br.invoices.get("inv_1")!.payment!.status).toBe("unpaid"); // orphan expires unpaid
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
  });

  it("4. a crash in paying -> getInvoice first, and no second pay if it's already paid", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    h.br.crashAfterPay = true;
    await h.ticks(1);
    expect(h.store.getFulfillment(order.id)!.state).toBe("paying");
    h.advance(60_000);
    await h.ticks(3);
    expect(h.br.payCalls).toBe(1);
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
  });

  it("5. pay returns 404 while the invoice is paid -> paid", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    h.br.pay404AfterPaying = true;
    await h.ticks(3);
    expect(h.br.payCalls).toBe(1);
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
    expect(h.wallet.sent.filter((s) => s.memo!.includes("refund"))).toHaveLength(0);
  });

  it("6. a failed Bitrefill order -> exactly one refund", async () => {
    const reply = fakeUa();
    const order = h.order("test-fail", reply);
    const out = h.pay(order.id, order.price_zat, reply);
    await h.ticks(6);
    const refunds = h.wallet.sent.filter((s) => s.memo!.includes("refund"));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.to).toBe(reply);
    expect(refunds[0]!.amountZat).toBe(order.price_zat);
    expect(refunds[0]!.memo).toContain("The purchase failed; nothing was bought.");
    expect(refunds[0]!.memo).toContain(`ref ${out.txid.slice(0, 8)}`);
    expect(h.store.getPayment(out.key)!.state).toBe("refunded");
    expect(h.store.getOrder(order.id)!.status).toBe("refunded");
  });

  it("7. a crash in refund_sending without listSent -> held, and no resend", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const out = h.pay(order.id, order.price_zat - 1, reply); // underpaid -> refund
    h.wallet.failNextSend = "after";
    h.wallet.listSentSupported = false;
    await h.ticks(1);
    expect(h.store.getPayment(out.key)!.state).toBe("refund_sending");
    h.advance(10 * 60_000);
    await h.ticks(5);
    expect(h.wallet.sends).toBe(1);
    expect(h.store.getPayment(out.key)!.state).toBe("held");
    expect(h.store.getPayment(out.key)!.reason).toBe("refund_needs_review");
  });

  it("7b. with listSent, a refund whose response was lost is found, not resent", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const out = h.pay(order.id, order.price_zat - 1, reply);
    h.wallet.failNextSend = "after";
    await h.ticks(1);
    h.advance(10 * 60_000);
    await h.ticks(3);
    expect(h.wallet.sends).toBe(1);
    expect(h.store.getPayment(out.key)!.state).toBe("refunded");
  });

  it("8. refunds use the memo's reply_ua, never the order's", async () => {
    const orderReply = fakeUa();
    const memoReply = fakeUa();
    const order = h.order("test-ok", orderReply);
    h.pay(order.id, order.price_zat - 1, memoReply); // underpaid, memo names a different reply address
    await h.ticks(2);
    const refunds = h.wallet.sent.filter((s) => s.memo!.includes("refund"));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.to).toBe(memoReply);
    expect(h.wallet.sent.some((s) => s.to === orderReply)).toBe(false);
  });

  it("9. no code or address appears in events.detail or logs", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    const other = h.order("test-ok", fakeUa());
    h.pay(other.id, other.price_zat - 5, reply); // a refund too
    await h.ticks(5);
    const details = h.store.events(500).map((e) => `${e.type} ${e.detail ?? ""}`).join("\n");
    const logs = h.logs.join("");
    for (const text of [details, logs]) {
      expect(text).not.toContain(CODE_PREFIX);
      expect(text).not.toContain(reply);
      expect(text).not.toContain(SHOP_UA);
      expect(text).not.toContain("CHUPKE1 ");
    }
    expect(h.wallet.sent.some((s) => s.memo!.includes(CODE_PREFIX))).toBe(true); // the code did go out, by memo only
  });
});

describe("sends refused before broadcast", () => {
  it("a delivery refused at proposal retries on normal backoff and sends once", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.pay(order.id, order.price_zat, reply);
    h.wallet.failNextSend = "reject";
    await h.ticks(1);
    const f = h.store.getFulfillment(order.id)!;
    expect(f.state).toBe("delivery_sending");
    expect(f.send_started_at).toBeNull(); // known not sent: no resend guard
    h.advance(10_000); // well under the 180 s resend guard
    await h.ticks(1);
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
    expect(h.wallet.sends).toBe(2);
    expect(h.wallet.sent).toHaveLength(1);
  });

  it("a refund refused at proposal goes back to refund_pending and is retried", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const out = h.pay(order.id, order.price_zat - 1, reply);
    h.wallet.failNextSend = "reject";
    await h.ticks(1);
    expect(h.store.getPayment(out.key)!.state).toBe("refund_pending");
    h.advance(10_000);
    await h.ticks(1);
    expect(h.store.getPayment(out.key)!.state).toBe("refunded");
    expect(h.wallet.sent).toHaveLength(1);
  });
});

describe("routing edge cases", () => {
  it("dust is ignored, junk memos are held, unknown orders are refunded", async () => {
    const o1 = { txid: "1".repeat(64), pool: "ironwood" as const, outputIndex: 0, amountZat: 100, memo: null, minedHeight: 1001, confirmations: 1 };
    const o2 = { txid: "2".repeat(64), pool: "ironwood" as const, outputIndex: 0, amountZat: 50_000_000, memo: "thanks from the faucet", minedHeight: 1001, confirmations: 1 };
    h.wallet.incoming.push({ ...o1, key: paymentKey(o1) }, { ...o2, key: paymentKey(o2) });
    const ghost = h.pay("7K2M9QXR4T", 1_000_000, fakeUa());
    await h.ticks(3);
    expect(h.store.getPayment(paymentKey(o1))!.state).toBe("ignored_dust");
    expect(h.store.getPayment(paymentKey(o2))!.state).toBe("held");
    expect(h.store.getPayment(ghost.key)!.state).toBe("refunded");
    expect(h.store.getPayment(ghost.key)!.reason).toBe("unknown_order");
  });

  it("outputs mined before the first start are not processed", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const old = h.pay(order.id, order.price_zat, reply);
    h.wallet.incoming[h.wallet.incoming.length - 1] = { ...old, minedHeight: 900 };
    await h.ticks(3);
    expect(h.store.getPayment(old.key)).toBeUndefined();
    expect(h.br.createCalls).toBe(0);
  });

  it("a late payment for an expired quote is refunded", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    h.advance(31 * 60_000); // TTL 20 + grace 10
    await h.ticks(1);
    expect(h.store.getOrder(order.id)!.status).toBe("expired");
    h.pay(order.id, order.price_zat, reply);
    await h.ticks(2);
    expect(h.store.paymentsForOrder(order.id)[0]!.reason).toBe("quote_expired");
    expect(h.br.createCalls).toBe(0);
  });

  it("waits for MIN_CONFIRMATIONS before routing", async () => {
    const reply = fakeUa();
    const order = h.order("test-ok", reply);
    const out = h.pay(order.id, order.price_zat, reply, { conf: 0 });
    await h.ticks(2);
    expect(h.store.getPayment(out.key)!.state).toBe("seen");
    h.wallet.incoming[0] = { ...h.wallet.incoming[0]!, confirmations: 1 };
    await h.ticks(2);
    expect(h.store.getFulfillment(order.id)!.state).toBe("memo_sent");
  });
});
