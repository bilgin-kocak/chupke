/**
 * Chupke worker: not internet-facing. Holds the shop wallet, the Bitrefill key (or uses the egress
 * proxy's), and the state machine. Runs one tick every TICK_MS; ticks never overlap, and a stop
 * signal lets the current tick finish (a wallet send is never cut in half).
 */
import { BitrefillClient } from "./bitrefill/client.js";
import { loadAllowlist, loadDotEnv, loadWorkerConfig } from "./config.js";
import { openDb } from "./db/schema.js";
import { Store } from "./db/store.js";
import { Engine } from "./engine/tick.js";
import { createLogger } from "./log.js";
import { ZingoWallet } from "./zcash/zingo.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const log = createLogger({ name: "worker" });
const store = new Store(openDb(cfg.DATABASE_PATH));
const allowlist = loadAllowlist(cfg.ALLOWLIST_PATH);

const wallet = new ZingoWallet({
  cliPath: cfg.ZINGO_CLI_PATH,
  dataDir: cfg.SHOP_WALLET_DIR,
  server: cfg.LIGHTWALLETD_URL,
  extraCaFile: cfg.ZINGO_EXTRA_CA_FILE,
  logger: log.child({ component: "zingo" }),
});
const bitrefill = new BitrefillClient({
  baseUrl: cfg.BITREFILL_BASE_URL,
  apiKey: cfg.BITREFILL_API_KEY,
  onEvent: (e) => store.addEvent(Date.now(), "rate_limited", {}, `${e.method} ${e.path} wait ${e.waitMs} ms (attempt ${e.attempt})`),
});

const engine = new Engine({
  store,
  wallet,
  bitrefill,
  allowlist,
  now: Date.now,
  log,
  cfg: {
    minConfirmations: cfg.MIN_CONFIRMATIONS,
    dustZat: cfg.DUST_ZAT,
    graceMin: cfg.GRACE_MIN,
    pausePurchases: cfg.PAUSE_PURCHASES,
    allowRealPurchases: cfg.ALLOW_REAL_PURCHASES,
    maxOrderUsd: cfg.MAX_ORDER_USD,
    maxDailyUsd: cfg.MAX_DAILY_USD,
    dailyCapIncludesTest: cfg.DAILY_CAP_INCLUDES_TEST,
    deliveryAmountZat: cfg.DELIVERY_AMOUNT_ZAT,
    purgeAfterMin: cfg.PURGE_AFTER_MIN,
    resendGuardMs: cfg.RESEND_GUARD_SEC * 1000,
    invoicePollMs: 8_000,
    ingestFromHeight: cfg.INGEST_FROM_HEIGHT,
    bitrefillBalanceEveryMs: cfg.BITREFILL_BALANCE_EVERY_SEC * 1000,
  },
});

if (!wallet.walletExists()) {
  log.fatal({ dir: cfg.SHOP_WALLET_DIR }, "no shop wallet; create it first (see docs/WALLET.md)");
  process.exit(1);
}

const { shopUa, ingestFromHeight } = await engine.init();
if (cfg.SHOP_UA && cfg.SHOP_UA !== shopUa) {
  log.fatal("SHOP_UA does not match the shop wallet's primary address; refusing to start");
  process.exit(1);
}
log.info(
  { ingestFromHeight, tickMs: cfg.TICK_MS, allowReal: cfg.ALLOW_REAL_PURCHASES, paused: cfg.PAUSE_PURCHASES, skus: allowlist.map((e) => e.sku) },
  "worker started",
);

let stopping = false;
let timer: NodeJS.Timeout | undefined;
let ticking = false;

async function loop(): Promise<void> {
  ticking = true;
  try {
    const r = await engine.tick();
    const busy = r.ingested + r.routed + r.advanced + r.refunds + r.expired > 0;
    log[r.errors.length ? "warn" : busy ? "info" : "debug"]({ ...r }, "tick");
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : String(e) }, "tick crashed");
  } finally {
    ticking = false;
  }
  if (stopping) process.exit(0);
  timer = setTimeout(() => void loop(), cfg.TICK_MS);
}

function stop(signal: string): void {
  if (stopping) {
    log.warn({ signal }, "second signal: exiting now");
    process.exit(1);
  }
  stopping = true;
  log.info({ signal }, ticking ? "stopping after the current tick" : "stopping");
  if (!ticking) {
    if (timer) clearTimeout(timer);
    process.exit(0);
  }
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

void loop();
