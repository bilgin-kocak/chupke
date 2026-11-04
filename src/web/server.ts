/**
 * Chupke web: public and secret-free. It reads the allowlist and the public shop address, creates
 * orders and shows status. It never sees the wallet seed, viewing keys, the Bitrefill key or any
 * redemption code. No request logging (the server would otherwise record buyer IPs).
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { loadAllowlist, loadDotEnv, loadWebConfig, type WebConfig } from "../config.js";
import { openDb } from "../db/schema.js";
import { Store, type OrderRow } from "../db/store.js";
import { istDayStart, reasonText } from "../engine/guard.js";
import { isOrderId } from "../ids.js";
import { createLogger } from "../log.js";
import { createOrder, priceZat } from "../orders.js";
import { buildPaymentMemo } from "../zcash/memo.js";
import { buildPaymentUri, zatToZec } from "../zcash/zip321.js";
import { qrSvg } from "./qr.js";
import { dashboardPage, homePage, notFoundPage, orderPage, type DashboardData } from "./views.js";

export type Stage = "waiting" | "seen" | "confirmed" | "buying" | "delivered" | "sent" | "refunding" | "refunded" | "expired" | "held";

export interface PublicStatus {
  id: string;
  label: string;
  priceZat: number;
  priceTaz: string;
  expiresAt: number;
  stage: Stage;
  reasonText: string | null;
  deliveryTxid: string | null;
  refundTxid: string | null;
  /** Overpayment returned after delivery (amount above the price), if any. */
  overpayZat: number | null;
  overpayState: string | null;
  overpayRefundTxid: string | null;
  explorer: string;
}

/** Status for the order page and /api/o/:id: no addresses, no memo, no code. */
export function publicStatus(store: Store, order: OrderRow, cfg: Pick<WebConfig, "MIN_CONFIRMATIONS" | "EXPLORER_TX_URL">): PublicStatus {
  const pays = store.paymentsForOrder(order.id);
  const f = store.getFulfillment(order.id);
  const outcomeRefund = pays.find((p) => ["refund_pending", "refund_sending", "refunded"].includes(p.state) && p.reason !== "duplicate_payment");
  const held = pays.find((p) => p.state === "held");
  let stage: Stage = "waiting";
  if (pays.length > 0) stage = "seen";
  if (pays.some((p) => p.state !== "seen" || p.confirmations >= cfg.MIN_CONFIRMATIONS)) stage = "confirmed";
  if (f) {
    if (["claimed", "invoice_created", "paying", "paid"].includes(f.state)) stage = "buying";
    if (["delivered", "delivery_sending"].includes(f.state)) stage = "delivered";
    if (f.state === "memo_sent") stage = "sent";
  }
  if (stage !== "sent" && outcomeRefund) stage = outcomeRefund.state === "refunded" ? "refunded" : "refunding";
  else if (stage !== "sent" && f?.state === "failed") stage = "refunding";
  else if (stage !== "sent" && held) stage = "held";
  else if (stage === "waiting" && order.status === "expired") stage = "expired";
  const reasonSource = outcomeRefund ?? held;
  const own = f ? pays.find((p) => p.key === f.payment_key) : undefined;
  return {
    id: order.id,
    label: order.label,
    priceZat: order.price_zat,
    priceTaz: zatToZec(order.price_zat),
    expiresAt: order.expires_at,
    stage,
    reasonText: reasonSource ? reasonText(reasonSource.reason) : null,
    deliveryTxid: f?.delivery_txid ?? null,
    refundTxid: outcomeRefund?.refund_txid ?? null,
    overpayZat: own?.excess_zat ?? null,
    overpayState: own?.excess_state ?? null,
    overpayRefundTxid: own?.excess_txid ?? null,
    explorer: cfg.EXPLORER_TX_URL,
  };
}

export function createApp(store: Store, cfg: WebConfig) {
  const allowlist = loadAllowlist(cfg.ALLOWLIST_PATH);
  const products = allowlist.map((e) => ({
    sku: e.sku,
    label: e.label,
    valueUsd: e.value_usd,
    priceTaz: zatToZec(priceZat(e.value_usd, cfg.DEMO_ZAT_PER_USD)),
    kind: e.kind,
    note: e.note,
  }));
  // The hero mockup's QR is decorative: it encodes a sentence, never a payment request.
  let heroQr: string | null = null;
  const home = async (extra: { sku?: string; reply?: string; error?: string } = {}) => {
    heroQr ??= await qrSvg("Chupke: gift cards, bought quietly. This QR is an illustration, not a payment request.");
    const last = store.kvGet("last_tick_at");
    const age = last ? Math.round((Date.now() - Number(last.v)) / 1000) : null;
    return homePage({ products, ...extra, heroQr, stats: store.publicStats(), shop: { online: age !== null && age < 90, lastTickAgeSec: age } });
  };
  const shopUa = () => cfg.SHOP_UA ?? store.kvGet("shop_ua")?.v ?? null;
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Cache-Control", "no-store");
  });

  app.get("/", async (c) => c.html(await home()));

  app.post("/orders", async (c) => {
    const form = await c.req.parseBody();
    const sku = typeof form.sku === "string" ? form.sku : "";
    const reply = typeof form.reply === "string" ? form.reply : "";
    if (!shopUa()) return c.html(await home({ sku, reply, error: "The shop wallet isn't ready yet. Try again in a minute." }), 503);
    const r = createOrder(store, allowlist, { sku, replyUa: reply }, { demoZatPerUsd: cfg.DEMO_ZAT_PER_USD, orderTtlMin: cfg.ORDER_TTL_MIN, now: Date.now() });
    if (!r.ok) return c.html(await home({ sku, reply, error: r.message }), 400);
    // This order's own address, if the worker has derived spares; otherwise it shows the shop UA.
    const own = store.claimPoolAddress(r.order.id, shopUa()!, Date.now());
    store.addEvent(
      Date.now(),
      "order_created",
      { orderId: r.order.id },
      `${r.order.sku}, ${r.order.price_zat} zat, ${own ? "own address" : "shop address"}`,
    );
    return c.redirect(`/o/${r.order.id}`, 303);
  });

  app.get("/o/:id", async (c) => {
    const id = c.req.param("id");
    const order = isOrderId(id) ? store.getOrder(id) : undefined;
    if (!order) return c.html(notFoundPage(), 404);
    const shop = shopUa();
    const ua = shop ? store.payAddress(order, shop) : null;
    const memo = order.reply_ua ? buildPaymentMemo(order.id, order.reply_ua) : null;
    const uri = memo && ua ? buildPaymentUri({ address: ua, amountZat: order.price_zat, memo, message: `Chupke order ${order.id}` }) : null;
    const status = publicStatus(store, order, cfg);
    return c.html(
      orderPage({
        id: order.id,
        label: order.label,
        priceTaz: zatToZec(order.price_zat),
        expiresAt: order.expires_at,
        uri,
        memo,
        qr: uri ? await qrSvg(uri) : null,
        ownAddress: ua !== null && ua !== shop,
        statusJson: JSON.stringify(status).replace(/</g, "\\u003c"),
      }),
    );
  });

  app.get("/api/o/:id", (c) => {
    const id = c.req.param("id");
    const order = isOrderId(id) ? store.getOrder(id) : undefined;
    if (!order) return c.json({ error: "not_found" }, 404);
    return c.json(publicStatus(store, order, cfg));
  });

  const dashboardPassword = cfg.DASHBOARD_PASSWORD;
  if (dashboardPassword) {
    app.use("/dashboard", basicAuth({ username: "chupke", password: dashboardPassword }));
    app.get("/dashboard", (c) => {
      const now = Date.now();
      const db = store.db;
      const kv: DashboardData["kv"] = {};
      for (const k of ["wallet_balance", "bitrefill_balance", "chain_height", "last_tick_at"]) kv[k] = store.kvGet(k);
      const shop = shopUa();
      return c.html(
        dashboardPage({
          now,
          spendUsd: store.committedSpendUsd(istDayStart(now), cfg.DAILY_CAP_INCLUDES_TEST),
          maxOrderUsd: cfg.MAX_ORDER_USD,
          maxDailyUsd: cfg.MAX_DAILY_USD,
          dailyCapIncludesTest: cfg.DAILY_CAP_INCLUDES_TEST,
          kv,
          poolFree: shop ? store.freePoolCount(shop) : null,
          orders: db.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`).all() as Array<Record<string, unknown>>,
          payments: db.prepare(`SELECT * FROM payments ORDER BY first_seen_at DESC LIMIT 50`).all() as Array<Record<string, unknown>>,
          fulfillments: db.prepare(`SELECT * FROM fulfillments ORDER BY created_at DESC LIMIT 50`).all() as Array<Record<string, unknown>>,
          events: store.events(150),
          explorer: cfg.EXPLORER_TX_URL,
        }),
      );
    });
  }

  app.get("/healthz", (c) => {
    const last = store.kvGet("last_tick_at");
    const tickAgeSec = last ? Math.round((Date.now() - Number(last.v)) / 1000) : null;
    return c.json({ ok: true, shopReady: shopUa() !== null, lastTickAt: last ? Number(last.v) : null, tickAgeSec });
  });

  app.notFound((c) => c.html(notFoundPage(), 404));
  return app;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  loadDotEnv();
  const cfg = loadWebConfig();
  const log = createLogger({ name: "web" });
  const store = new Store(openDb(cfg.DATABASE_PATH));
  const app = createApp(store, cfg);
  serve({ fetch: app.fetch, port: cfg.PORT }, (info) => log.info({ port: info.port }, "web listening"));
}
