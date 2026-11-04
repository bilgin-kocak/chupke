/**
 * Zcash wallet smoke test through the ZcashWallet adapter (zingo-cli).
 *
 *   npm run wallet:smoke -- --wallet shop|buyer                 # info, sync, address, balance, incoming, sent
 *   npm run wallet:smoke -- --wallet buyer --send-to shop --amount 200000 --memo chupke
 *   npm run wallet:smoke -- --wallet shop --send-to buyer --amount 10000 --memo plain
 *   npm run wallet:smoke -- --wallet shop --check-last-send     # does listIncoming hold the last send?
 *
 * Never prints memo text, seeds or viewing keys. Addresses are shown shortened. A send records
 * {txid, sha256(memo)} in data/smoke/last-send.json so the receiving side can verify the memo
 * byte-for-byte without anyone printing it.
 */
import { createHash, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { ZingoWallet } from "../src/zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const { values } = parseArgs({
  options: {
    wallet: { type: "string", default: "shop" },
    "send-to": { type: "string" },
    amount: { type: "string", default: "10000" },
    memo: { type: "string", default: "plain" },
    "check-last-send": { type: "boolean", default: false },
  },
});

const logger = createLogger({ level: "warn", name: "wallet-smoke" });
const dirs: Record<string, string> = { shop: cfg.SHOP_WALLET_DIR, buyer: cfg.BUYER_WALLET_DIR };
function walletFor(name: string): ZingoWallet {
  const dataDir = dirs[name];
  if (!dataDir) throw new Error(`unknown wallet ${name}`);
  return new ZingoWallet({
    cliPath: cfg.ZINGO_CLI_PATH,
    dataDir,
    server: cfg.LIGHTWALLETD_URL,
    extraCaFile: cfg.ZINGO_EXTRA_CA_FILE,
    logger,
  });
}

const short = (a: string) => `${a.slice(0, 12)}…${a.slice(-6)}`;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const testOrderId = () => Array.from({ length: 10 }, () => CROCKFORD[randomInt(32)]).join("");

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  console.log(`ok   ${label} (${Date.now() - t0} ms)`);
  return r;
}

const name = values.wallet!;
const w = walletFor(name);
console.log(`wallet-smoke: ${name} wallet at ${w.dataDir}`);

const info = await timed("info", () => w.info());
console.log(`     chain height ${info.chainHeight}, wallet height ${info.walletHeight}`);
await timed("sync", () => w.sync());
const ua = await timed("primaryAddress", () => w.primaryAddress());
console.log(`     ${short(ua)} (${ua.length} chars, shielded unified address: ${ua.startsWith("utest1")})`);
const bal = await timed("balance", () => w.balance());
console.log(`     spendable ${bal.spendableZat} zat, total ${bal.totalZat} zat`);

const incoming = await timed("listIncoming", () => w.listIncoming());
console.log(`     ${incoming.length} received output(s)`);
for (const o of incoming) {
  console.log(
    `     - ${o.key} pool=${o.pool} amount=${o.amountZat} mined=${o.minedHeight ?? "no"} conf=${o.confirmations} memo=${o.memo === null ? "none" : `${Buffer.byteLength(o.memo)} bytes`}`,
  );
}
try {
  const sent = await timed("listSent", () => w.listSent());
  console.log(`     ${sent.length} memo-bearing send(s)`);
  for (const s of sent) console.log(`     - ${s.txid} amount=${s.amountZat} to=${s.to ? short(s.to) : "?"} memo=${s.memo ? `${Buffer.byteLength(s.memo)} bytes` : "none"}`);
} catch (e) {
  console.log(`FAIL listSent: ${(e as Error).message}`);
}

if (values["check-last-send"]) {
  const last = JSON.parse(readFileSync("data/smoke/last-send.json", "utf8")) as { txid: string; memoSha256: string; amountZat: number };
  const hit = incoming.find((o) => o.txid === last.txid);
  if (!hit) {
    console.log(`last send ${last.txid}: NOT in listIncoming yet`);
    process.exitCode = 1;
  } else {
    const memoOk = hit.memo !== null && sha(hit.memo) === last.memoSha256;
    console.log(
      `last send ${last.txid}: found, pool=${hit.pool} amount=${hit.amountZat} (expected ${last.amountZat}), conf=${hit.confirmations}, memo byte-exact: ${memoOk ? "yes" : "NO"}`,
    );
    process.exitCode = memoOk && hit.amountZat === last.amountZat ? 0 : 1;
  }
}

const target = values["send-to"];
if (target) {
  const toUa = dirs[target] ? await walletFor(target).primaryAddress() : target;
  const amountZat = Number(values.amount);
  const memo =
    values.memo === "chupke"
      ? `CHUPKE1 o=${testOrderId()} r=${ua}` // payment-memo format, reply address = this wallet
      : `Chupke smoke ${new Date().toISOString()}`;
  console.log(`send ${amountZat} zat to ${short(toUa)} with a ${values.memo} memo (${Buffer.byteLength(memo)} bytes)`);
  const { txid } = await timed("send", () => w.send(toUa, amountZat, memo));
  console.log(`     txid ${txid}`);
  console.log(`     explorer https://testnet.zcashexplorer.app/transactions/${txid}`);
  mkdirSync("data/smoke", { recursive: true });
  writeFileSync(
    "data/smoke/last-send.json",
    JSON.stringify({ txid, from: name, to: target, amountZat, memoSha256: sha(memo), at: new Date().toISOString() }, null, 2),
  );
}
