/**
 * Bitrefill REST v2 smoke test: ping, balance, search, product details (including test products).
 *
 *   npm run bitrefill:smoke -- [search query]
 *
 * Prints response shapes and package ids. Never prints the API key (in the sandbox it is attached
 * by the egress proxy and never enters this process).
 */
import { BitrefillClient, BitrefillError, type Product } from "../src/bitrefill/client.js";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const query = process.argv[2] ?? "amazon";
const client = new BitrefillClient({
  baseUrl: cfg.BITREFILL_BASE_URL,
  apiKey: cfg.BITREFILL_API_KEY,
  onEvent: (e) => console.log(`  [event] ${e.type} ${e.method} ${e.path} wait=${e.waitMs}ms`),
});

function describePackages(p: Product): string[] {
  return (p.packages ?? []).slice(0, 8).map((pkg) => {
    const fields = Object.entries(pkg)
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    return `    - ${fields}`;
  });
}

async function step(name: string, fn: () => Promise<void>): Promise<boolean> {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - t0} ms)`);
    return true;
  } catch (err) {
    const e = err instanceof BitrefillError ? `${err.kind} status=${err.status} code=${err.errorCode} ${err.message}` : String(err);
    console.log(`FAIL ${name} (${Date.now() - t0} ms): ${e}`);
    return false;
  }
}

console.log(`Bitrefill smoke against ${cfg.BITREFILL_BASE_URL} (auth: ${cfg.BITREFILL_API_KEY ? "env key" : "proxy-injected or none"})`);
const results: boolean[] = [];

results.push(
  await step("GET /ping", async () => {
    console.log("  ", JSON.stringify(await client.ping()));
  }),
);

results.push(
  await step("GET /accounts/balance", async () => {
    console.log("  ", JSON.stringify(await client.balance()));
  }),
);

results.push(
  await step(`GET /products/search?q=${query}`, async () => {
    const list = await client.searchProducts(query, { limit: 10 });
    console.log(`   ${list.length} results`);
    for (const p of list.slice(0, 10)) {
      const keys = Object.keys(p).slice(0, 12).join(",");
      console.log(`   - ${p.id} | ${p.name ?? "?"} | ${p.currency ?? "?"} | keys: ${keys}`);
    }
  }),
);

results.push(
  await step("GET /products/search?q=test (include_test_products)", async () => {
    const list = await client.searchProducts("test", { includeTest: true, limit: 20 });
    const tests = list.filter((p) => p.id.startsWith("test-"));
    console.log(`   ${list.length} results, ${tests.length} test products: ${tests.map((p) => p.id).join(", ")}`);
  }),
);

for (const id of ["test-gift-card-code", "test-gift-card-code-fail"]) {
  results.push(
    await step(`GET /products/${id}?include_test_products=true`, async () => {
      const p = await client.getProduct(id, { includeTest: true });
      console.log(`   ${p.id} | ${p.name ?? "?"} | currency=${p.currency ?? "?"} | keys: ${Object.keys(p).join(",")}`);
      console.log(`   packages (${p.packages?.length ?? 0}):`);
      for (const line of describePackages(p)) console.log(line);
    }),
  );
}

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? "\nall steps ok" : `\n${failed} step(s) failed`);
process.exitCode = failed === 0 ? 0 : 1;
