import type { AllowlistEntry } from "../config.js";
import type { OrderRow } from "../db/store.js";

/** Guard rules (SPEC §9). Pure: everything it needs comes in through the input. */
export type GuardCode = "paused" | "underpaid" | "not_allowed" | "real_purchases_disabled" | "over_order_cap" | "over_daily_cap";

/** Human text for every refund reason; used in the refund memo and on the order page. */
export const REASON_TEXT: Record<string, string> = {
  paused: "Shop is paused",
  underpaid: "Payment was less than the price",
  not_allowed: "Product not available",
  real_purchases_disabled: "Shop isn't selling this yet",
  over_order_cap: "Over the per-order limit",
  over_daily_cap: "Shop's daily limit reached",
  unknown_order: "Order not found",
  duplicate_payment: "This order was already paid",
  quote_expired: "The price quote expired",
  bitrefill_rejected: "The gift card provider rejected the order",
  shop_out_of_credit: "Shop is temporarily out of credit",
  invoice_not_payable: "The purchase could not be paid",
  bitrefill_order_failed: "The gift card provider could not deliver",
  no_reply_address: "No reply address in the payment memo",
  refund_needs_review: "Refund needs manual review",
};

export function reasonCode(reason: string | null): string {
  return (reason ?? "").split(":")[0] ?? "";
}

export function reasonText(reason: string | null): string {
  return REASON_TEXT[reasonCode(reason)] ?? "Order could not be completed";
}

/** Reasons where Bitrefill took the order and then failed it (the memo says so). */
export const PURCHASE_FAILED_REASONS = new Set(["bitrefill_order_failed"]);

export interface GuardInput {
  pausePurchases: boolean;
  allowRealPurchases: boolean;
  maxOrderUsd: number;
  maxDailyUsd: number;
  dailyCapIncludesTest: boolean;
  /** Committed spend today (IST), already filtered the same way as dailyCapIncludesTest. */
  todaySpendUsd: number;
  amountZat: number;
  order: Pick<OrderRow, "sku" | "kind" | "product_id" | "package_id" | "value" | "value_usd" | "price_zat">;
  entry: AllowlistEntry | undefined;
}

export type GuardResult = { ok: true } | { ok: false; code: GuardCode; text: string };

function reject(code: GuardCode): GuardResult {
  return { ok: false, code, text: REASON_TEXT[code]! };
}

export function guard(i: GuardInput): GuardResult {
  if (i.pausePurchases) return reject("paused");
  if (i.amountZat < i.order.price_zat) return reject("underpaid");
  const e = i.entry;
  if (
    !e ||
    e.sku !== i.order.sku ||
    e.kind !== i.order.kind ||
    e.product_id !== i.order.product_id ||
    (e.package_id ?? null) !== (i.order.package_id ?? null) ||
    (e.value ?? null) !== (i.order.value ?? null) ||
    e.value_usd !== i.order.value_usd
  ) {
    return reject("not_allowed");
  }
  if (e.kind === "real" && !i.allowRealPurchases) return reject("real_purchases_disabled");
  if (i.order.value_usd > i.maxOrderUsd) return reject("over_order_cap");
  const counts = e.kind === "real" || i.dailyCapIncludesTest;
  if (counts && i.todaySpendUsd + i.order.value_usd > i.maxDailyUsd) return reject("over_daily_cap");
  return { ok: true };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the current IST calendar day, as unix ms. */
export function istDayStart(now: number): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}
