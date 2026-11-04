/**
 * Demo payer: pay a Chupke order from the CLI buyer wallet, exactly as a wallet would from the QR.
 *
 *   npm run buyer:pay -- --order <id> [--base http://localhost:8080] [--amount <zat>]
 *   npm run buyer:pay -- --uri 'zcash:...'
 *
 * Reads the ZIP 321 link from the order page, decodes amount and memo, and sends one shielded
 * payment. --amount overrides the amount (to test underpayment refunds). Never prints the memo or
 * the reply address.
 */
import { parseArgs } from "node:util";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { parsePaymentMemo } from "../src/zcash/memo.js";
import { parsePaymentUri } from "../src/zcash/zip321.js";
import { ZingoWallet } from "../src/zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const { values } = parseArgs({
  options: {
    order: { type: "string" },
    uri: { type: "string" },
    base: { type: "string", default: process.env.PUBLIC_BASE_URL || "http://localhost:8080" },
    amount: { type: "string" },
  },
});

let uri = values.uri;
if (!uri && values.order) {
  const res = await fetch(`${values.base}/o/${values.order}`);
  if (!res.ok) throw new Error(`order page returned ${res.status}`);
  const html = await res.text();
  const m = /href="(zcash:[^"]+)"/.exec(html);
  if (!m) throw new Error("no zcash: payment link on the order page");
  uri = m[1]!.replaceAll("&amp;", "&");
}
if (!uri) {
  console.error("usage: buyer-pay --order <id> [--base URL] [--amount zat] | --uri 'zcash:…'");
  process.exit(2);
}

const req = parsePaymentUri(uri);
const parsed = parsePaymentMemo(req.memo);
if (!parsed) throw new Error("the payment link's memo is not a Chupke payment memo");
const wallet = new ZingoWallet({
  cliPath: cfg.ZINGO_CLI_PATH,
  dataDir: cfg.BUYER_WALLET_DIR,
  server: cfg.LIGHTWALLETD_URL,
  extraCaFile: cfg.ZINGO_EXTRA_CA_FILE,
  logger: createLogger({ level: "warn", name: "buyer-pay" }),
});
const mine = await wallet.primaryAddress();
const amountZat = values.amount ? Number(values.amount) : req.amountZat;
console.log(`order ${parsed.orderId}: pay ${amountZat} zat to ${req.address.slice(0, 12)}…`);
console.log(`reply address in memo is this buyer wallet: ${parsed.replyUa === mine ? "yes" : "no"}`);
const t0 = Date.now();
const { txid } = await wallet.send(req.address, amountZat, req.memo!);
console.log(`sent in ${Date.now() - t0} ms: txid ${txid}`);
console.log(`explorer ${cfg.EXPLORER_TX_URL}${txid}`);
