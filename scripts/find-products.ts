/**
 * Find Bitrefill products and their exact package ids (REST v2), and print allowlist entries to paste
 * into config/allowlist.json.
 *
 *   npm run find-products -- <query> [--country IN] [--test] [--max-usd 10] [--limit 5]
 *   npm run find-products -- --id test-gift-card-code --test
 *
 * USD figures are estimates: Bitrefill prices are in the account currency (BTC sats), converted with the
 * test product's price_rate. For MCP-sourced USD prices and human approval, see scripts/mcp-catalog.ts.
 * Read-only: no invoices are created.
 */
import { parseArgs } from "node:util";
import { BitrefillClient, type Product } from "../src/bitrefill/client.js";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string" },
    country: { type: "string" },
    test: { type: "boolean", default: false },
    "max-usd": { type: "string" },
    limit: { type: "string", default: "5" },
  },
});
const query = positionals.join(" ");
if (!values.id && !query) {
  console.error("usage: find-products <query> [--country IN] [--test] [--max-usd 10] [--limit 5] | --id <product_id> [--test]");
  process.exit(2);
}
const maxUsd = values["max-usd"] ? Number(values["max-usd"]) : cfg.MAX_ORDER_USD;
const client = new BitrefillClient({ baseUrl: cfg.BITREFILL_BASE_URL, apiKey: cfg.BITREFILL_API_KEY });

// Sats per USD from the always-present test product's ranged price_rate.
const rate = Number(((await client.getProduct("test-gift-card-code", { includeTest: true })) as { range?: { price_rate?: number } }).range?.price_rate);
const usd = (sats: number) => (Number.isFinite(rate) && rate > 0 ? sats / rate : NaN);

let products: Product[];
if (values.id) {
  products = [await client.getProduct(values.id, { includeTest: values.test })];
} else {
  const found = await client.searchProducts(query, { includeTest: values.test, limit: Number(values.limit), country: values.country });
  products = await Promise.all(found.slice(0, Number(values.limit)).map((p) => client.getProduct(p.id, { includeTest: values.test })));
}

const entries: object[] = [];
for (const p of products) {
  const r = p as Product & { country_code?: string; in_stock?: boolean; recipient_type?: string; range?: { min: number; max: number; step: number } | null };
  console.log(`\n${p.id} | ${p.name ?? "?"} | ${p.currency ?? "?"} | country ${r.country_code ?? "?"} | in_stock ${r.in_stock ?? "?"} | recipient ${r.recipient_type ?? "?"}${r.range ? ` | ranged ${r.range.min}-${r.range.max} step ${r.range.step}` : ""}`);
  for (const pkg of p.packages ?? []) {
    const id = String(pkg.id ?? "");
    const price = Number(pkg.price);
    // USD cards: use the face value; other currencies: estimate from the sats price.
    const est = p.currency === "USD" ? Number(pkg.value) : usd(price);
    const ok = Number.isFinite(est) && est <= maxUsd;
    console.log(`  ${ok ? "*" : " "} ${JSON.stringify(id)}  value ${String(pkg.value)} ${p.currency ?? ""}  price ${price} sats (~$${est.toFixed(2)})`);
    if (ok && entries.length < 10 && (r.recipient_type ?? "none") === "none") {
      const test = p.id.startsWith("test-");
      entries.push({
        sku: `${p.id}-${String(pkg.value)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
        kind: test ? "test" : "real",
        label: `${p.name ?? p.id} ${String(pkg.value)} ${p.currency ?? ""}`.trim().slice(0, 60),
        product_id: p.id,
        package_id: id,
        value_usd: test ? Number(pkg.value) : Number(est.toFixed(2)),
      });
    }
  }
}
console.log(`\n* = within $${maxUsd}. Allowlist entries (review before pasting into ${cfg.ALLOWLIST_PATH}):`);
console.log(JSON.stringify(entries, null, 2));
