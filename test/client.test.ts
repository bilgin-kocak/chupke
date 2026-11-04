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

  it("classifies failed invoices and orders", () => {
    expect(invoiceFailed({ ...invoice("denied", "unpaid", []) })).toBe(true);
    expect(invoiceFailed({ ...invoice("complete", "paid", [["o1", "failed"]]) })).toBe(true);
    expect(invoiceFailed({ ...invoice("complete", "paid", [["o1", "delivered"]]) })).toBe(false);
    // "complete" alone is not proof of delivery.
    expect(allOrdersDelivered({ ...invoice("complete", "paid", [["o1", "processing"]]) })).toBe(false);
  });
});
