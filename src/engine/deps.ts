import type { Logger } from "pino";
import type { Balance, CreateInvoiceRequest, Invoice, Order } from "../bitrefill/client.js";
import type { AllowlistEntry } from "../config.js";
import type { Store } from "../db/store.js";
import type { ZcashWallet } from "../zcash/wallet.js";

/** The Bitrefill calls the engine uses (BitrefillClient implements it; tests use a fake). */
export interface BitrefillPort {
  createInvoice(req: CreateInvoiceRequest): Promise<Invoice>;
  payInvoice(invoiceId: string): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  getOrder(orderId: string): Promise<Order>;
  balance(): Promise<Balance>;
}

export interface EngineConfig {
  minConfirmations: number;
  dustZat: number;
  graceMin: number;
  pausePurchases: boolean;
  allowRealPurchases: boolean;
  maxOrderUsd: number;
  maxDailyUsd: number;
  /** Count free test products toward the daily cap (default false: the cap guards real spend). */
  dailyCapIncludesTest: boolean;
  deliveryAmountZat: number;
  /** After a delivery, return payment − price when it is at least this much (smaller excess is kept). */
  overpayRefundMinZat: number;
  purgeAfterMin: number;
  /** After a send may have gone out, wait this long for it to show in listSent before resending. */
  resendGuardMs: number;
  /** Poll Bitrefill invoices at most this often. */
  invoicePollMs: number;
  /** Ignore outputs mined below this height (pre-existing notes); undefined = chain tip at first start. */
  ingestFromHeight?: number | undefined;
  bitrefillBalanceEveryMs: number;
  /** Keep this many unclaimed per-order addresses derived ahead of time (0 = every order shows the shop UA). */
  addressPoolSize: number;
}

export interface EngineDeps {
  store: Store;
  wallet: ZcashWallet;
  bitrefill: BitrefillPort;
  allowlist: AllowlistEntry[];
  cfg: EngineConfig;
  now: () => number;
  log: Logger;
  random?: () => number;
}

/** next_attempt_at = now + min(60 s, 5 s × 2^attempts) + jitter. */
export function backoffAt(now: number, attempts: number, random: () => number = Math.random): number {
  return now + Math.min(60_000, 5_000 * 2 ** attempts) + Math.floor(random() * 1_000);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
