/**
 * Full rescan of the shop wallet (and the view-only inbox, if present): drop all chain-derived data
 * and sync again from the birthday. Run it with the worker stopped; the restarted worker then sees
 * every output again and must skip all known ones (I1) without buying or sending anything new.
 *
 *   npx tsx scripts/rescan.ts
 */
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { ZingoWallet } from "../src/zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const logger = createLogger({ level: "warn", name: "rescan" });
const common = { cliPath: cfg.ZINGO_CLI_PATH, server: cfg.LIGHTWALLETD_URL, extraCaFile: cfg.ZINGO_EXTRA_CA_FILE, logger, timeoutMs: 600_000 };

for (const [name, dir] of [
  ["shop", cfg.SHOP_WALLET_DIR],
  ["inbox", cfg.INBOX_WALLET_DIR],
] as const) {
  const w = new ZingoWallet({ ...common, dataDir: dir });
  if (!w.walletExists()) {
    console.log(`${name}: no wallet at ${dir}, skipped`);
    continue;
  }
  const before = (await w.listIncoming()).length;
  const t0 = Date.now();
  await w.rescan();
  const after = await w.listIncoming();
  console.log(`${name}: rescanned in ${Date.now() - t0} ms; received outputs before ${before}, after ${after.length}`);
}
