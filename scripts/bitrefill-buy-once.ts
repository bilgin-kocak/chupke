/**
 * Buy one allowlisted product from the shop's Bitrefill balance, exactly once.
 *
 *   npm run bitrefill:buy-once -- --sku test-ok [--fresh] [--max-wait-sec 300]
 *
 * Mirrors the engine's rules: the invoice id is saved before paying, "paying" is committed before
 * the pay call, and a resumed run checks the invoice first instead of paying again.
 * Real (non-test) products are refused unless ALLOW_REAL_PURCHASES=true.
 * The redemption is printed masked only; it is never written to disk.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  BitrefillClient,
  BitrefillError,
  allOrdersDelivered,
  invoiceFailed,
  invoiceUnpaid,
  type CreateInvoiceRequest,
  type Invoice,
} from "../src/bitrefill/client.js";
import { realSleep } from "../src/bitrefill/limiter.js";
import { hasRedeemable, maskRedemption, normalizeRedemption } from "../src/bitrefill/redemption.js";
import { loadAllowlist, loadDotEnv, loadWorkerConfig } from "../src/config.js";

type State = "claimed" | "invoice_created" | "paying" | "paid" | "delivered" | "failed";
interface Saved {
  sku: string;
  state: State;
  invoiceId: string | null;
  orderIds: string[];
  invoiceStatus: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

loadDotEnv();
const cfg = loadWorkerConfig();
const { values } = parseArgs({
  options: {
    sku: { type: "string" },
    fresh: { type: "boolean", default: false },
    "max-wait-sec": { type: "string", default: "300" },
  },
});
const sku = values.sku;
if (!sku) {
  console.error("usage: bitrefill-buy-once --sku <sku> [--fresh] [--max-wait-sec N]");
  process.exit(2);
}
const entry = loadAllowlist(cfg.ALLOWLIST_PATH).find((e) => e.sku === sku);
if (!entry) {
  console.error(`sku ${sku} is not in ${cfg.ALLOWLIST_PATH}`);
  process.exit(2);
}
if (entry.kind === "real" && !cfg.ALLOW_REAL_PURCHASES) {
  console.error(`sku ${sku} is a real product and ALLOW_REAL_PURCHASES=false: refusing.`);
  process.exit(3);
}

const dir = join("data", "buy-once");
mkdirSync(dir, { recursive: true });
const statePath = join(dir, `${sku}.json`);
const now = () => new Date().toISOString();

function save(s: Saved): void {
  s.updatedAt = now();
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, statePath);
}

let s: Saved;
if (existsSync(statePath)) {
  s = JSON.parse(readFileSync(statePath, "utf8")) as Saved;
  if ((s.state === "delivered" || s.state === "failed") && values.fresh) {
    renameSync(statePath, `${statePath}.${Date.now()}.done`);
    s = { sku, state: "claimed", invoiceId: null, orderIds: [], invoiceStatus: null, error: null, createdAt: now(), updatedAt: now() };
  } else if (s.state === "delivered" || s.state === "failed") {
    console.log(`previous run for ${sku} ended "${s.state}" (invoice ${s.invoiceId}). Pass --fresh to buy again.`);
    process.exit(s.state === "delivered" ? 0 : 1);
  } else {
    console.log(`resuming ${sku} from state "${s.state}" (invoice ${s.invoiceId ?? "none"})`);
  }
} else {
  s = { sku, state: "claimed", invoiceId: null, orderIds: [], invoiceStatus: null, error: null, createdAt: now(), updatedAt: now() };
}
save(s);

const client = new BitrefillClient({
  baseUrl: cfg.BITREFILL_BASE_URL,
  apiKey: cfg.BITREFILL_API_KEY,
  onEvent: (e) => console.log(`  [event] ${e.type} ${e.method} ${e.path} wait=${e.waitMs}ms`),
});

function describe(inv: Invoice): string {
  const orders = inv.orders.map((o) => `${o.id}:${o.status ?? "?"}`).join(", ");
  return `invoice ${inv.id} status=${inv.status} payment=${inv.payment?.status ?? "?"} price=${inv.payment?.price ?? "?"} ${inv.payment?.currency ?? ""} orders=[${orders}]`;
}

function fail(reason: string): never {
  s.state = "failed";
  s.error = reason;
  save(s);
  console.log(`FAILED: ${reason}`);
  process.exit(1);
}

async function pay(): Promise<void> {
  s.state = "paying"; // committed BEFORE the money-moving call (invariant I3)
  save(s);
  try {
    const inv = await client.payInvoice(s.invoiceId!);
    console.log(`pay -> 200: ${describe(inv)}`);
    s.state = "paid";
    s.invoiceStatus = inv.status;
    save(s);
  } catch (err) {
    if (!(err instanceof BitrefillError)) throw err;
    if (err.status === 403) fail("shop_out_of_credit");
    if (err.status === 404) {
      const inv = await client.getInvoice(s.invoiceId!);
      console.log(`pay -> 404, invoice says: ${describe(inv)}`);
      if (invoiceUnpaid(inv)) fail("invoice_not_payable");
      s.state = "paid";
      s.invoiceStatus = inv.status;
      save(s);
      return;
    }
    console.log(`pay -> ${err.message}; state stays "paying". Re-run to resume (it checks the invoice first).`);
    process.exit(1);
  }
}

const t0 = Date.now();
const maxWaitMs = Number(values["max-wait-sec"]) * 1000;

for (;;) {
  switch (s.state) {
    case "claimed": {
      const line = entry.package_id
        ? { product_id: entry.product_id, package_id: entry.package_id, quantity: 1 }
        : { product_id: entry.product_id, value: entry.value!, quantity: 1 };
      const req: CreateInvoiceRequest = { products: [line], payment_method: "balance", auto_pay: false };
      try {
        const inv = await client.createInvoice(req);
        s.invoiceId = inv.id;
        s.orderIds = inv.orders.map((o) => o.id);
        s.invoiceStatus = inv.status;
        s.state = "invoice_created";
        save(s);
        console.log(`created ${describe(inv)}`);
      } catch (err) {
        if (err instanceof BitrefillError && err.status === 400) fail(`bitrefill_rejected:${err.errorCode ?? "400"} (${err.message})`);
        throw err;
      }
      break;
    }
    case "invoice_created":
      await pay();
      break;
    case "paying": {
      // Resume path: never pay blindly. Look first.
      const inv = await client.getInvoice(s.invoiceId!);
      console.log(`resume check: ${describe(inv)}`);
      if (invoiceUnpaid(inv)) {
        await pay();
      } else {
        s.state = "paid";
        s.invoiceStatus = inv.status;
        save(s);
      }
      break;
    }
    case "paid": {
      const inv = await client.getInvoice(s.invoiceId!);
      s.invoiceStatus = inv.status;
      if (inv.orders.length > 0) s.orderIds = inv.orders.map((o) => o.id);
      save(s);
      console.log(`poll: ${describe(inv)}`);
      if (allOrdersDelivered(inv)) {
        s.state = "delivered";
        save(s);
        break;
      }
      if (invoiceFailed(inv)) fail("bitrefill_order_failed");
      if (Date.now() - t0 > maxWaitMs) {
        console.log(`still not delivered after ${values["max-wait-sec"]} s; state stays "paid". Re-run to keep polling.`);
        process.exit(1);
      }
      await realSleep(8_000); // poll invoices at most every 8 s
      break;
    }
    case "delivered": {
      for (const id of s.orderIds) {
        const order = await client.getOrder(id);
        const r = normalizeRedemption(order.redemption_info);
        const shape = order.redemption_info === null || order.redemption_info === undefined ? "missing" : typeof order.redemption_info;
        console.log(`order ${id} status=${order.status ?? "?"} redemption_info type=${shape} redeemable=${hasRedeemable(r)}`);
        console.log(`  masked: ${JSON.stringify(maskRedemption(r))}`);
      }
      console.log(`\nDONE: ${sku} delivered. Invoice ID: ${s.invoiceId}`);
      process.exit(0);
    }
    case "failed":
      fail(s.error ?? "failed");
  }
}
