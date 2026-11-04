/**
 * Evidence table for the README: the latest delivery (payment txid, Bitrefill invoice, delivery txid)
 * and the latest refund of each kind (payment txid, reason, refund txid), with explorer links.
 * Reads the SQLite file only; prints no addresses, memos or codes.
 *
 *   npx tsx scripts/evidence.ts [--out docs/EVIDENCE.md]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadDotEnv, loadWebConfig } from "../src/config.js";
import { openDb } from "../src/db/schema.js";
import { reasonText } from "../src/engine/guard.js";

loadDotEnv();
const cfg = loadWebConfig();
const { values } = parseArgs({ options: { out: { type: "string" } } });
const db = openDb(cfg.DATABASE_PATH);
const x = (txid: string | null) => (txid ? `[\`${txid.slice(0, 10)}…\`](${cfg.EXPLORER_TX_URL}${txid})` : "–");
const ist = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

const deliveries = db
  .prepare(
    `SELECT o.id, o.sku, o.kind, o.label, p.txid AS pay_txid, f.invoice_id, f.delivery_txid, f.updated_at
     FROM fulfillments f JOIN orders o ON o.id = f.order_id JOIN payments p ON p.key = f.payment_key
     WHERE f.state = 'memo_sent' ORDER BY f.updated_at DESC`,
  )
  .all() as Array<{ id: string; sku: string; kind: string; label: string; pay_txid: string; invoice_id: string; delivery_txid: string; updated_at: number }>;

// Refund time = the "refunded" event, the latest refund of each reason.
const refunds = db
  .prepare(
    `WITH r AS (
       SELECT p.order_id, p.reason, p.amount_zat, p.txid, p.refund_txid,
              (SELECT MAX(e.at) FROM events e WHERE e.payment_key = p.key AND e.type = 'refunded') AS updated_at
       FROM payments p WHERE p.state = 'refunded')
     SELECT * FROM r WHERE updated_at = (SELECT MAX(r2.updated_at) FROM r r2 WHERE r2.reason = r.reason)
     ORDER BY updated_at DESC`,
  )
  .all() as Array<{ order_id: string; reason: string; amount_zat: number; txid: string; refund_txid: string; updated_at: number }>;

const lines: string[] = [];
lines.push(`Generated ${ist(Date.now())} IST from the worker database. Explorer: ${cfg.EXPLORER_TX_URL.replace(/\/transactions\/$/, "")}`);
lines.push("");
lines.push("### Deliveries (code sent by shielded memo)");
lines.push("");
lines.push("| order | product | payment | Bitrefill invoice | delivery memo tx | at (IST) |");
lines.push("| --- | --- | --- | --- | --- | --- |");
const shown = [deliveries.find((d) => d.kind === "real"), ...deliveries.filter((d) => d.kind !== "real").slice(0, 3)].filter(Boolean) as typeof deliveries;
for (const d of shown) {
  lines.push(`| ${d.id} | ${d.label}${d.kind === "real" ? " (real)" : " (test)"} | ${x(d.pay_txid)} | \`${d.invoice_id}\` | ${x(d.delivery_txid)} | ${ist(d.updated_at)} |`);
}
if (shown.length === 0) lines.push("| – | – | – | – | – | – |");
lines.push("");
lines.push("### Refunds (latest of each kind)");
lines.push("");
lines.push("| order | reason (memo text) | amount | payment | refund tx | at (IST) |");
lines.push("| --- | --- | --- | --- | --- | --- |");
for (const r of refunds) {
  lines.push(`| ${r.order_id} | \`${r.reason}\` (${reasonText(r.reason)}) | ${(r.amount_zat / 1e8).toString()} TAZ | ${x(r.txid)} | ${x(r.refund_txid)} | ${ist(r.updated_at)} |`);
}
if (refunds.length === 0) lines.push("| – | – | – | – | – | – |");
const md = lines.join("\n") + "\n";
if (values.out) writeFileSync(values.out, md);
process.stdout.write(md);
