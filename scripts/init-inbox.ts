/**
 * Create the view-only inbox for WALLET_MODE=split from the shop wallet's UFVK, then check that it
 * sees the same received outputs (same payment keys) as the full shop wallet.
 *
 *   npx tsx scripts/init-inbox.ts
 *
 * The UFVK stays in memory (never printed or written by this script).
 */
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { ZingoWallet } from "../src/zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const logger = createLogger({ level: "warn", name: "init-inbox" });
const common = { cliPath: cfg.ZINGO_CLI_PATH, server: cfg.LIGHTWALLETD_URL, extraCaFile: cfg.ZINGO_EXTRA_CA_FILE, logger };
const shop = new ZingoWallet({ ...common, dataDir: cfg.SHOP_WALLET_DIR });
const inbox = new ZingoWallet({ ...common, dataDir: cfg.INBOX_WALLET_DIR, timeoutMs: 600_000 });

if (inbox.walletExists()) {
  console.log(`inbox already exists at ${inbox.dataDir}`);
} else {
  const { ufvk, birthday } = await shop.exportUfvk();
  console.log(`creating view-only inbox at ${inbox.dataDir} (UFVK ${ufvk.length} chars, birthday ${birthday})`);
  const t0 = Date.now();
  await inbox.initWallet({ viewkey: ufvk, birthday });
  console.log(`created and synced in ${Date.now() - t0} ms`);
}

await inbox.sync();
const [a, b] = [await inbox.primaryAddress(), await shop.primaryAddress()];
console.log(`same primary address as the shop wallet: ${a === b ? "yes" : "NO"}`);
const [inKeys, shopKeys] = [(await inbox.listIncoming()).map((o) => o.key).sort(), (await shop.listIncoming()).map((o) => o.key).sort()];
const same = inKeys.length === shopKeys.length && inKeys.every((k, i) => k === shopKeys[i]);
console.log(`received outputs: inbox ${inKeys.length}, shop ${shopKeys.length}, identical keys: ${same ? "yes" : "NO"}`);
try {
  await inbox.send(b, 1000, "must fail");
  console.log("UNEXPECTED: view-only inbox could send");
} catch (e) {
  console.log(`view-only inbox refuses to send: yes (${(e as Error).name})`);
}
process.exitCode = a === b && same ? 0 : 1;
