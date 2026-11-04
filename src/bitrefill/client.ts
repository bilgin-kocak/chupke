import { z } from "zod";
import {
  CompositeLimiter,
  MinIntervalLimiter,
  SlidingWindowLimiter,
  backoffMs,
  parseRetryAfter,
  realSleep,
  type Sleep,
} from "./limiter.js";

// ---------------------------------------------------------------------------------------------
// Response shapes. Lenient on purpose: live responses win over docs (SPEC §7), so unknown fields
// pass through and only the fields the engine relies on are required.
// ---------------------------------------------------------------------------------------------

const Money = z.union([z.number(), z.string()]);

export const InvoiceOrderSchema = z
  .looseObject({
    id: z.string(),
    status: z.string().optional(),
  })
  // Live GET /invoices/{id} embeds each order's redemption_info. Drop it at parse time: codes are
  // fetched only through getOrder at send time and never ride on invoice objects (invariant I6).
  .transform(({ redemption_info: _dropped, ...rest }) => rest);

export const InvoiceSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  payment: z
    .looseObject({
      status: z.string().optional(),
      price: Money.optional(),
      currency: z.string().optional(),
    })
    .optional(),
  orders: z.array(InvoiceOrderSchema).optional().default([]),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const OrderSchema = z.looseObject({
  id: z.string(),
  status: z.string().optional(),
  redemption_info: z.unknown().optional(),
});
export type Order = z.infer<typeof OrderSchema>;

export const ProductSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string().optional(),
  packages: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const BalanceSchema = z.looseObject({
  balance: Money.optional(),
  currency: z.string().optional(),
});
export type Balance = z.infer<typeof BalanceSchema>;

export interface InvoiceLine {
  product_id: string;
  /** Exact string from product details; omit for ranged products and send `value` instead. */
  package_id?: string;
  value?: number;
  quantity: number;
}

export interface CreateInvoiceRequest {
  products: InvoiceLine[];
  payment_method: "balance";
  auto_pay: false;
}

export const INVOICE_FAILED_STATUSES = new Set(["blocked", "denied", "payment_error"]);
export const ORDER_FAILED_STATUSES = new Set(["failed", "refunded"]);

/** Done means every order is "delivered"; an invoice marked "complete" alone is not proof. */
export function allOrdersDelivered(inv: Invoice): boolean {
  return inv.orders.length > 0 && inv.orders.every((o) => o.status === "delivered");
}

export function invoiceFailed(inv: Invoice): boolean {
  return INVOICE_FAILED_STATUSES.has(inv.status) || inv.orders.some((o) => ORDER_FAILED_STATUSES.has(o.status ?? ""));
}

export function invoiceUnpaid(inv: Invoice): boolean {
  return (inv.payment?.status ?? inv.status) === "unpaid";
}

// ---------------------------------------------------------------------------------------------
// Errors and events
// ---------------------------------------------------------------------------------------------

export class BitrefillError extends Error {
  constructor(
    readonly kind: "http" | "network" | "parse",
    readonly status: number | null,
    readonly errorCode: string | null,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "BitrefillError";
  }

  /** 429, 5xx and network failures: safe to back off and try again later (non-money calls). */
  get transient(): boolean {
    return this.kind === "network" || this.status === 429 || (this.status !== null && this.status >= 500);
  }
}

export type BitrefillEvent = {
  type: "rate_limited";
  method: string;
  path: string;
  waitMs: number;
  attempt: number;
};

interface Acquirer {
  acquire(): Promise<void>;
}

export interface BitrefillClientOptions {
  baseUrl: string;
  /** Omit when an egress proxy attaches the Authorization header (Claude Code network secret). */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
  /** Non-product endpoints: at most 55 requests per 10 minutes (Bitrefill allows 60). */
  generalLimiter?: Acquirer;
  /** /products and /products/search: 60 per minute and 1000 per hour upstream. */
  productLimiter?: Acquirer;
  /** /ping: 1 request per 3 seconds upstream. */
  pingLimiter?: Acquirer;
  onEvent?: (e: BitrefillEvent) => void;
  sleep?: Sleep;
  /** Automatic retries for idempotent GETs on 429/5xx/network errors. POSTs never retry here. */
  getRetries?: number;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | undefined>;

export class BitrefillClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly general: Acquirer;
  private readonly products: Acquirer;
  private readonly pingLimit: Acquirer;
  private readonly onEvent: (e: BitrefillEvent) => void;
  private readonly sleep: Sleep;
  private readonly getRetries: number;
  private readonly timeoutMs: number;

  constructor(opts: BitrefillClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.general = opts.generalLimiter ?? new SlidingWindowLimiter(55, 10 * 60_000);
    this.products =
      opts.productLimiter ??
      new CompositeLimiter([new SlidingWindowLimiter(55, 60_000), new SlidingWindowLimiter(950, 60 * 60_000)]);
    this.pingLimit = opts.pingLimiter ?? new MinIntervalLimiter(3_100);
    this.onEvent = opts.onEvent ?? (() => undefined);
    this.sleep = opts.sleep ?? realSleep;
    this.getRetries = opts.getRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  ping(): Promise<unknown> {
    return this.request("GET", "/ping", "/ping", { schema: z.unknown(), limiter: this.pingLimit });
  }

  balance(): Promise<Balance> {
    return this.request("GET", "/accounts/balance", "/accounts/balance", { schema: BalanceSchema });
  }

  searchProducts(q: string, opts: { includeTest?: boolean; limit?: number; country?: string } = {}): Promise<Product[]> {
    return this.request("GET", "/products/search", "/products/search", {
      query: { q, include_test_products: opts.includeTest, limit: opts.limit, country: opts.country },
      schema: z.array(ProductSchema),
      limiter: this.products,
    });
  }

  getProduct(id: string, opts: { includeTest?: boolean } = {}): Promise<Product> {
    return this.request("GET", `/products/${encodeURIComponent(id)}`, "/products/{id}", {
      query: { include_test_products: opts.includeTest },
      schema: ProductSchema,
      limiter: this.products,
    });
  }

  /** Moves no money (invariant I4). Not retried automatically: the caller saves the id first. */
  createInvoice(req: CreateInvoiceRequest): Promise<Invoice> {
    return this.request("POST", "/invoices", "/invoices", { body: req, schema: InvoiceSchema, retry: false });
  }

  /** Money-moving. Never retried here; callers commit "paying" first and check getInvoice on resume. */
  payInvoice(invoiceId: string): Promise<Invoice> {
    return this.request("POST", `/invoices/${encodeURIComponent(invoiceId)}/pay`, "/invoices/{id}/pay", {
      body: {},
      schema: InvoiceSchema,
      retry: false,
    });
  }

  getInvoice(invoiceId: string): Promise<Invoice> {
    return this.request("GET", `/invoices/${encodeURIComponent(invoiceId)}`, "/invoices/{id}", { schema: InvoiceSchema });
  }

  /** The response carries redemption_info: a secret. Never log it; hold it in memory only. */
  getOrder(orderId: string): Promise<Order> {
    return this.request("GET", `/orders/${encodeURIComponent(orderId)}`, "/orders/{id}", { schema: OrderSchema });
  }

  /** Raw JSON for discovery scripts (never use for orders: they hold redemption secrets). */
  getRaw(path: string, query: Query = {}, limiter: "general" | "products" = "general"): Promise<unknown> {
    return this.request("GET", path, path, {
      query,
      schema: z.unknown(),
      limiter: limiter === "products" ? this.products : this.general,
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    template: string,
    opts: { query?: Query; body?: unknown; schema: z.ZodType<T>; limiter?: Acquirer; retry?: boolean },
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "chupke/0.1" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const retry = opts.retry ?? method === "GET";
    const limiter = opts.limiter ?? this.general;

    for (let attempt = 0; ; attempt++) {
      await limiter.acquire();
      let res: Response;
      try {
        const init: RequestInit = { method, headers, signal: AbortSignal.timeout(this.timeoutMs) };
        if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
        res = await this.fetchImpl(url, init);
      } catch (err) {
        if (retry && attempt < this.getRetries) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        const why = err instanceof Error ? err.name : "error";
        throw new BitrefillError("network", null, null, `${method} ${template}: network ${why}`);
      }

      if (res.status === 429) {
        const waitMs = parseRetryAfter(res.headers.get("retry-after")) ?? backoffMs(attempt);
        this.onEvent({ type: "rate_limited", method, path: template, waitMs, attempt });
        await res.body?.cancel();
        if (retry && attempt < this.getRetries) {
          await this.sleep(waitMs);
          continue;
        }
        throw new BitrefillError("http", 429, "rate_limited", `${method} ${template}: 429 rate limited`, waitMs);
      }

      const text = await res.text();
      let json: unknown;
      try {
        json = text === "" ? undefined : JSON.parse(text);
      } catch {
        json = undefined;
      }

      if (!res.ok) {
        if (retry && res.status >= 500 && attempt < this.getRetries) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        const body = (json ?? {}) as { message?: unknown; error_code?: unknown; status?: unknown };
        const code = typeof body.error_code === "string" ? body.error_code : typeof body.status === "string" ? body.status : null;
        const message = typeof body.message === "string" ? body.message.slice(0, 200) : `HTTP ${res.status}`;
        throw new BitrefillError("http", res.status, code, `${method} ${template}: ${res.status} ${message}`);
      }

      const data = json !== null && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
      const parsed = opts.schema.safeParse(data);
      if (!parsed.success) {
        throw new BitrefillError("parse", res.status, null, `${method} ${template}: unexpected response shape`);
      }
      return parsed.data;
    }
  }
}
