import type { AllowlistEntry } from "./config.js";
import type { OrderRow, Store } from "./db/store.js";
import { newOrderId } from "./ids.js";
import { replyAddressProblem, type AddressProblem } from "./zcash/address.js";
import { buildPaymentMemo, memoBytes, MEMO_MAX_BYTES } from "./zcash/memo.js";

/** price_zat = round(value_usd × DEMO_ZAT_PER_USD). Testnet coins have no value. */
export function priceZat(valueUsd: number, demoZatPerUsd: number): number {
  return Math.round(valueUsd * demoZatPerUsd);
}

export const ADDRESS_HELP: Record<AddressProblem, string> = {
  empty: "Paste a fresh shielded address from your wallet.",
  not_testnet_unified: "That isn't a testnet unified address. It should start with utest1.",
  charset: "That address has characters a Zcash address can't contain.",
  too_short: "That address is too short. Copy the whole address.",
  too_long: "That address is too long to fit in the payment memo.",
  checksum: "That address has a typo (its checksum doesn't match). Copy it again.",
};

export type CreateOrderResult = { ok: true; order: OrderRow } | { ok: false; field: "sku" | "reply"; message: string };

/** Validate a sku and reply address, then insert an order awaiting payment. */
export function createOrder(
  store: Store,
  allowlist: AllowlistEntry[],
  input: { sku: string; replyUa: string },
  opts: { demoZatPerUsd: number; orderTtlMin: number; now: number },
): CreateOrderResult {
  const entry = allowlist.find((e) => e.sku === input.sku);
  if (!entry) return { ok: false, field: "sku", message: "Pick a product." };
  const replyUa = input.replyUa.trim();
  const problem = replyAddressProblem(replyUa);
  if (problem) return { ok: false, field: "reply", message: ADDRESS_HELP[problem] };
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newOrderId();
    if (store.getOrder(id)) continue;
    if (memoBytes(buildPaymentMemo(id, replyUa)) > MEMO_MAX_BYTES) return { ok: false, field: "reply", message: ADDRESS_HELP.too_long };
    const order: OrderRow = {
      id,
      sku: entry.sku,
      kind: entry.kind,
      product_id: entry.product_id,
      package_id: entry.package_id ?? null,
      value: entry.value ?? null,
      value_usd: entry.value_usd,
      label: entry.label,
      price_zat: priceZat(entry.value_usd, opts.demoZatPerUsd),
      reply_ua: replyUa,
      pay_ua: null,
      created_at: opts.now,
      expires_at: opts.now + opts.orderTtlMin * 60_000,
      status: "awaiting_payment",
      terminal_at: null,
      updated_at: opts.now,
    };
    store.insertOrder(order);
    return { ok: true, order };
  }
  throw new Error("could not allocate an order id");
}
