import { describe, expect, it } from "vitest";
import { BitrefillClient, BitrefillError, allOrdersDelivered, invoiceFailed, type BitrefillEvent } from "../src/bitrefill/client.js";

const noLimit = { acquire: async () => undefined };

function fakeFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; method: string; auth: string | null }> = [];
  const impl = (async (input: URL | string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), method: init?.method ?? "GET", auth: headers.get("authorization") });
    const r = responses.shift();
    if (!r) throw new Error("unexpected call");
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch, events: BitrefillEvent[] = [], apiKey?: string) {
  return new BitrefillClient({
    baseUrl: "https://api.example.test/v2",
    apiKey,
    fetchImpl,
    generalLimiter: noLimit,
    productLimiter: noLimit,
    pingLimiter: noLimit,
    sleep: async () => undefined,
    random: () => 0,
    onEvent: (e) => events.push(e),
  });
}

const invoice = (status: string, payment: string, orders: Array<[string, string]>) => ({
  id: "inv_1",
  status,
  payment: { status: payment, price: 5, currency: "USD" },
  orders: orders.map(([id, s]) => ({ id, status: s })),
});

describe("BitrefillClient", () => {
  it("unwraps {data} and sends Authorization only when a key is configured", async () => {
    const f = fakeFetch([{ status: 200, body: { meta: {}, data: invoice("unpaid", "unpaid", [["o1", "created"]]) } }]);
    const inv = await client(f.impl).getInvoice("inv_1");
    expect(inv.payment?.status).toBe("unpaid");
    expect(f.calls[0]!.auth).toBeNull();

    const g = fakeFetch([{ status: 200, body: { data: {} } }]);
    await client(g.impl, [], "k3y").balance();
    expect(g.calls[0]!.auth).toBe("Bearer k3y");
  });

  it("retries a GET after 429 honoring Retry-After, and emits rate_limited", async () => {
    const events: BitrefillEvent[] = [];
    const f = fakeFetch([
      { status: 429, headers: { "retry-after": "2" } },
      { status: 200, body: { data: invoice("complete", "paid", [["o1", "delivered"]]) } },
    ]);
    const inv = await client(f.impl, events).getInvoice("inv_1");
    expect(allOrdersDelivered(inv)).toBe(true);
    expect(events).toEqual([{ type: "rate_limited", method: "GET", path: "/invoices/{id}", waitMs: 2000, attempt: 0 }]);
  });

  it("adds up to 0.5 s of jitter on top of Retry-After and gives up after the retry budget", async () => {
    const events: BitrefillEvent[] = [];
    const waits: number[] = [];
    const f = fakeFetch(Array.from({ length: 4 }, () => ({ status: 429, headers: { "retry-after": "3" } })));
    const c = new BitrefillClient({
      baseUrl: "https://api.example.test/v2",
      fetchImpl: f.impl,
      pingLimiter: noLimit,
      sleep: async (ms) => void waits.push(ms),
      random: () => 0.5,
      onEvent: (e) => events.push(e),
    });
    const err = (await c.ping().catch((e: unknown) => e)) as BitrefillError;
    expect(err).toMatchObject({ status: 429, errorCode: "rate_limited", retryAfterMs: 3250 });
    expect(f.calls).toHaveLength(4); // first try + 3 retries
    expect(waits).toEqual([3250, 3250, 3250]);
    expect(events.map((e) => e.attempt)).toEqual([0, 1, 2, 3]);
  });

  it("never retries the money-moving pay call", async () => {
    const f = fakeFetch([{ status: 429, headers: { "retry-after": "1" } }]);
    await expect(client(f.impl).payInvoice("inv_1")).rejects.toMatchObject({ status: 429 });
    expect(f.calls).toHaveLength(1);

    const g = fakeFetch([{ status: 404, body: { message: "Invoice not found or already paid" } }]);
    const err = (await client(g.impl).payInvoice("inv_1").catch((e: unknown) => e)) as BitrefillError;
    expect(err.status).toBe(404);
    expect(g.calls).toHaveLength(1);
  });

  it("maps a 400 to its error_code without retrying invoice creation", async () => {
    const f = fakeFetch([{ status: 400, body: { message: "Invalid package", error_code: "invalid_package" } }]);
    const err = (await client(f.impl)
      .createInvoice({ products: [{ product_id: "p", package_id: "x", quantity: 1 }], payment_method: "balance", auto_pay: false })
      .catch((e: unknown) => e)) as BitrefillError;
    expect(err).toBeInstanceOf(BitrefillError);
    expect(err.errorCode).toBe("invalid_package");
    expect(f.calls).toHaveLength(1);
  });

  it("drops redemption_info that live invoices embed in their orders", async () => {
    const body = invoice("all_delivered", "complete", [["o1", "delivered"]]);
    (body.orders[0] as Record<string, unknown>).redemption_info = { code: "SECRET-CODE-1234", other: "x" };
    const f = fakeFetch([{ status: 200, body: { data: body } }]);
    const inv = await client(f.impl).getInvoice("inv_1");
    expect(inv.orders[0]!.status).toBe("delivered");
    expect(JSON.stringify(inv)).not.toContain("SECRET-CODE-1234");
  });

  it("classifies failed invoices and orders", () => {
    expect(invoiceFailed({ ...invoice("denied", "unpaid", []) })).toBe(true);
    expect(invoiceFailed({ ...invoice("complete", "paid", [["o1", "failed"]]) })).toBe(true);
    expect(invoiceFailed({ ...invoice("complete", "paid", [["o1", "delivered"]]) })).toBe(false);
    // Live shape of a failing test product (2026-11-04): invoice "all_error", order "permanent_failure".
    expect(invoiceFailed({ ...invoice("all_error", "complete", [["o1", "permanent_failure"]]) })).toBe(true);
    expect(invoiceFailed({ ...invoice("not_delivered", "complete", [["o1", "permanent_failure"]]) })).toBe(true);
    expect(invoiceFailed({ ...invoice("not_delivered", "complete", [["o1", "processing"]]) })).toBe(false);
    // "complete" alone is not proof of delivery.
    expect(allOrdersDelivered({ ...invoice("complete", "paid", [["o1", "processing"]]) })).toBe(false);
  });
});
