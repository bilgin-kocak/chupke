/**
 * The buyer's memo inbox, as a wallet would show it, with secrets masked.
 *
 *   npm run buyer:inbox -- [--order <id>]
 *
 * Lists received memos that start with "Chupke #". Delivery codes, PINs and redeem links are masked;
 * refund memos carry no secrets and are shown in full. With --order, exits 0 only if that order's
 * delivery (or refund) arrived.
 */
import { parseArgs } from "node:util";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { ZingoWallet } from "../src/zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const { values } = parseArgs({ options: { order: { type: "string" } } });
const wallet = new ZingoWallet({
  cliPath: cfg.ZINGO_CLI_PATH,
  dataDir: cfg.BUYER_WALLET_DIR,
  server: cfg.LIGHTWALLETD_URL,
  extraCaFile: cfg.ZINGO_EXTRA_CA_FILE,
  logger: createLogger({ level: "warn", name: "buyer-inbox" }),
});

function mask(line: string): string {
  const m = /^(Code|PIN): (.*)$/.exec(line);
  if (m) {
    const v = m[2]!;
    return `${m[1]}: ${v.slice(0, 2)}${"*".repeat(Math.max(0, Math.min(v.length - 4, 12)))}${v.length > 4 ? v.slice(-2) : ""} (${v.length} chars)`;
  }
  if (line.startsWith("Redeem: ")) {
    try {
      return `Redeem: ${new URL(line.slice(8)).origin}/… (masked)`;
    } catch {
      return "Redeem: (masked)";
    }
  }
  return line;
}

await wallet.sync();
const notes = (await wallet.listIncoming()).filter((o) => o.memo?.startsWith("Chupke #"));
let found = false;
for (const o of notes.sort((a, b) => (a.minedHeight ?? Infinity) - (b.minedHeight ?? Infinity))) {
  const lines = o.memo!.split("\n");
  if (values.order && !lines[0]!.startsWith(`Chupke #${values.order} `)) continue;
  found = true;
  console.log(`— ${o.txid} · ${o.amountZat} zat · ${o.minedHeight ? `mined ${o.minedHeight}, ${o.confirmations} conf` : "in mempool"}`);
  for (const l of lines) console.log(`    ${mask(l)}`);
}
if (!found) console.log(values.order ? `no Chupke memo for order ${values.order} yet` : "no Chupke memos yet");
process.exitCode = values.order && !found ? 1 : 0;
