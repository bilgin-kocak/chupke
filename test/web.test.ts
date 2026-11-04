import { describe, expect, it } from "vitest";
import { loadWebConfig } from "../src/config.js";
import { openDb } from "../src/db/schema.js";
import { Store } from "../src/db/store.js";
import { createApp } from "../src/web/server.js";
import { memoToBase64Url } from "../src/zcash/zip321.js";
import { fakeUa } from "./helpers.js";

const SHOP = fakeUa();

function app() {
  const store = new Store(openDb(":memory:"));
  const cfg = loadWebConfig({ SHOP_UA: SHOP, ALLOWLIST_PATH: "./config/allowlist.json" } as NodeJS.ProcessEnv);
  return { store, app: createApp(store, cfg) };
}

async function createOrder(a: ReturnType<typeof app>["app"], reply: string, sku = "test-ok") {
  return a.request("/orders", { method: "POST", body: new URLSearchParams({ sku, reply }) });
}

describe("web", () => {
  it("home page shows the pitch, products and reply-address guidance", async () => {
    const res = await app().app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Buy quietly.");
    expect(html).toContain("Test gift card");
    expect(html).toContain("0.01 TAZ");
    expect(html).toContain("Paste a fresh shielded address from your wallet (starts with utest1). Your code or refund is sent here.");
    expect(html).toContain("Get payment QR");
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/); // no external assets
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("rejects a bad reply address with a helpful message", async () => {
    const { app: a } = app();
    const bad = fakeUa();
    const res = await createOrder(a, bad.slice(0, -1) + (bad.endsWith("q") ? "p" : "q"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("typo");
    expect((await createOrder(a, "tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd")).status).toBe(400);
    expect((await createOrder(a, fakeUa(), "no-such-sku")).status).toBe(400);
  });

  it("creates an order and shows a ZIP 321 payment request with the exact memo", async () => {
    const { app: a } = app();
    const reply = fakeUa();
    const res = await createOrder(a, reply);
    expect(res.status).toBe(303);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^\/o\/[0-9A-HJKMNP-TV-Z]{10}$/);
    const id = loc.slice(3);
    const html = await (await a.request(loc)).text();
    const memo = `CHUPKE1 o=${id} r=${reply}`;
    expect(html).toContain(`zcash:${SHOP}?amount=0.01&amp;memo=${memoToBase64Url(memo)}&amp;message=Chupke%20order%20${id}`);
    expect(html).toContain(memo);
    expect(html).toContain("<svg");
    expect(html).toContain("Who can see what");
    expect(html).not.toContain("Code:");
  });

  it("shows each order its own pool address when one is free, else the shop UA", async () => {
    const { app: a, store } = app();
    const own = fakeUa();
    store.addPoolAddress(own, 1, SHOP, 0);
    store.addPoolAddress(fakeUa(), 1, fakeUa(), 0); // derived by another wallet: never handed out
    const first = await (await a.request((await createOrder(a, fakeUa())).headers.get("location")!)).text();
    expect(first).toContain(`zcash:${own}?amount=0.01`);
    expect(first).toContain("This payment address is used for this order only.");
    expect(first).not.toContain(SHOP);
    const second = await (await a.request((await createOrder(a, fakeUa())).headers.get("location")!)).text();
    expect(second).toContain(`zcash:${SHOP}?amount=0.01`);
    expect(second).not.toContain("used for this order only");
    expect(store.freePoolCount(SHOP)).toBe(0);
  });

  it("status API returns no addresses or codes", async () => {
    const { app: a } = app();
    const reply = fakeUa();
    const id = (await createOrder(a, reply)).headers.get("location")!.slice(3);
    const res = await a.request(`/api/o/${id}`);
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({ id, stage: "waiting", priceZat: 1_000_000, priceTaz: "0.01" });
    expect(body).not.toContain(reply);
    expect(body).not.toContain(SHOP);
    expect((await a.request("/api/o/NOPE")).status).toBe(404);
  });

  it("dashboard needs the password and masks addresses to 8 chars", async () => {
    const store = new Store(openDb(":memory:"));
    const cfg = loadWebConfig({ SHOP_UA: SHOP, DASHBOARD_PASSWORD: "pw" } as NodeJS.ProcessEnv);
    const a = createApp(store, cfg);
    const reply = fakeUa();
    await createOrder(a, reply);
    expect((await a.request("/dashboard")).status).toBe(401);
    const res = await a.request("/dashboard", { headers: { Authorization: `Basic ${Buffer.from("chupke:pw").toString("base64")}` } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("spend (IST)");
    expect(html).toContain(`${reply.slice(0, 8)}…`);
    expect(html).not.toContain(reply);
    expect((await app().app.request("/dashboard")).status).toBe(404); // no password configured: no dashboard
  });

  it("healthz reports readiness", async () => {
    const res = await app().app.request("/healthz");
    expect(await res.json()).toMatchObject({ ok: true, shopReady: true });
  });
});
