/**
 * Allowlist proposals from Bitrefill's hosted MCP server, approved by a human.
 *
 *   npx tsx scripts/mcp-catalog.ts --query "Google Play" --country IN [--max-usd 10] [--per-product 2]
 *   npx tsx scripts/mcp-catalog.ts --approve google-play-india-100
 *
 * Two Bitrefill surfaces, each where it is strongest:
 * - MCP (`search-products`, `get-product-details` with currency=USD) discovers products and real USD prices.
 * - REST v2 (`GET /products/{id}`) confirms the exact package_id string the worker will buy with.
 * Proposals within MAX_ORDER_USD go to config/allowlist.proposed.json. Nothing is buyable until a human
 * runs --approve, and even then the worker refuses kind "real" while ALLOW_REAL_PURCHASES=false.
 * Read-only against Bitrefill: no MCP buy tool is ever called.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { BitrefillClient } from "../src/bitrefill/client.js";
import { AllowlistEntry, loadDotEnv, loadWorkerConfig } from "../src/config.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const { values } = parseArgs({
  options: {
    query: { type: "string" },
    country: { type: "string", default: "IN" },
    "max-usd": { type: "string" },
    "per-product": { type: "string", default: "2" },
    approve: { type: "string" },
  },
});
const PROPOSED = "config/allowlist.proposed.json";
const MCP_URL = "https://api.bitrefill.com/mcp";
const READ_TOOLS = new Set(["search-products", "get-product-details"]);

interface Proposal extends AllowlistEntry {
  source: string;
  price_usd: string;
  rest_package_verified: boolean;
  proposed_at: string;
}

async function mcp(name: string, args: Record<string, unknown>): Promise<string> {
  if (!READ_TOOLS.has(name)) throw new Error(`refusing to call non-read MCP tool ${name}`);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (cfg.BITREFILL_API_KEY) headers.Authorization = `Bearer ${cfg.BITREFILL_API_KEY}`; // else the egress proxy attaches it
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!res.ok) throw new Error(`MCP ${name}: HTTP ${res.status}`);
  const text = await res.text();
  const payload = text.includes("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("") : text;
  const json = JSON.parse(payload) as { result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: { message: string } };
  if (json.error) throw new Error(`MCP ${name}: ${json.error.message}`);
  const out = (json.result?.content ?? []).map((c) => c.text ?? "").join("\n");
  if (json.result?.isError) throw new Error(`MCP ${name}: ${out.slice(0, 200)}`);
  return out;
}

/** TOON helpers for the two shapes used here. */
function toonField(text: string, key: string): string | null {
  const m = new RegExp(`^${key}: (.+)$`, "m").exec(text);
  return m ? m[1]!.replace(/^"|"$/g, "") : null;
}
function toonPackages(text: string): Array<{ value: string; currency: string; priceUsd: string }> {
  const m = /^packages\[(\d+)\]\{package_value,package_currency,payment_price,payment_currency\}:\n((?: {2}.*\n?)+)/m.exec(text);
  if (!m) return [];
  return m[2]!
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")))
    .filter((c) => c.length === 4 && c[3] === "USD")
    .map((c) => ({ value: c[0]!, currency: c[1]!, priceUsd: c[2]! }));
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

if (values.approve) {
  const proposals = readJson<Proposal[]>(PROPOSED, []);
  const p = proposals.find((x) => x.sku === values.approve);
  if (!p) {
    console.error(`no proposal with sku ${values.approve} in ${PROPOSED}`);
    process.exit(2);
  }
  const allow = readJson<AllowlistEntry[]>(cfg.ALLOWLIST_PATH, []);
  if (allow.some((e) => e.sku === p.sku)) {
    console.log(`${p.sku} is already allowlisted`);
    process.exit(0);
  }
  const entry = AllowlistEntry.parse({ sku: p.sku, kind: p.kind, label: p.label, product_id: p.product_id, package_id: p.package_id, value_usd: p.value_usd });
  writeFileSync(cfg.ALLOWLIST_PATH, `${JSON.stringify([...allow, entry], null, 2)}\n`);
  console.log(`approved ${entry.sku} ($${entry.value_usd}) into ${cfg.ALLOWLIST_PATH}.`);
  console.log(`Restart web and worker to load it. Real purchases still need ALLOW_REAL_PURCHASES=true and Bitrefill balance.`);
  process.exit(0);
}

if (!values.query) {
  console.error('usage: mcp-catalog --query "<brand>" [--country IN] [--max-usd 10] [--per-product 2] | --approve <sku>');
  process.exit(2);
}
const maxUsd = values["max-usd"] ? Number(values["max-usd"]) : cfg.MAX_ORDER_USD;
const perProduct = Number(values["per-product"]);
const rest = new BitrefillClient({ baseUrl: cfg.BITREFILL_BASE_URL, apiKey: cfg.BITREFILL_API_KEY });

const found = await mcp("search-products", {
  query: values.query,
  intent: "Chupke shop allowlist: small gift cards a buyer can pay for privately with shielded ZEC",
  country: values.country,
  in_stock: true,
  per_page: 5,
});
const slugs = [...found.matchAll(/^\s+slug: (\S+)$/gm)].map((m) => m[1]!);
console.log(`MCP search-products "${values.query}" in ${values.country}: ${slugs.length} in-stock product(s): ${slugs.join(", ") || "none"}`);

const proposals: Proposal[] = [];
for (const slug of slugs) {
  const details = await mcp("get-product-details", { product_id: slug, currency: "USD" });
  const name = toonField(details, "name") ?? slug;
  const recipient = toonField(details, "recipient_type");
  if (recipient && recipient !== "none") {
    console.log(`  skip ${slug}: needs a recipient (${recipient}), not a code-only gift card`);
    continue;
  }
  const restIds = new Set((await rest.getProduct(slug)).packages?.map((p) => String(p.id)) ?? []);
  const cheap = toonPackages(details)
    .filter((p) => Number(p.priceUsd) <= maxUsd)
    .sort((a, b) => Number(a.priceUsd) - Number(b.priceUsd))
    .slice(0, perProduct);
  for (const p of cheap) {
    const packageId = `${slug}<&>${p.value}`;
    const verified = restIds.has(packageId);
    console.log(`  ${verified ? "propose" : "skip   "} ${packageId}  ${p.value} ${p.currency} for $${p.priceUsd}${verified ? "" : " (package id not in REST v2 details)"}`);
    if (!verified) continue;
    proposals.push({
      sku: `${slug}-${p.value}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
      kind: "real",
      label: `${name} ${p.currency === "INR" ? "₹" : ""}${p.value}${p.currency === "INR" ? "" : ` ${p.currency}`}`.slice(0, 60),
      product_id: slug,
      package_id: packageId,
      value_usd: Number(p.priceUsd),
      source: "bitrefill-mcp get-product-details (USD), package id checked with REST v2",
      price_usd: p.priceUsd,
      rest_package_verified: true,
      proposed_at: new Date().toISOString(),
    });
  }
}
const existing = readJson<Proposal[]>(PROPOSED, []).filter((e) => !proposals.some((p) => p.sku === e.sku));
writeFileSync(PROPOSED, `${JSON.stringify([...existing, ...proposals], null, 2)}\n`);
console.log(`\n${proposals.length} proposal(s) written to ${PROPOSED}. Approve one with: npx tsx scripts/mcp-catalog.ts --approve <sku>`);
