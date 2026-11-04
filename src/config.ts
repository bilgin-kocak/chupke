import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/** Load ./.env (if present) without overriding variables already set in the environment. */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

const bool = (def: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(def)
    .transform((v) => v === "true");
const int = (def: number) => z.coerce.number().int().nonnegative().default(def);
const num = (def: number) => z.coerce.number().nonnegative().default(def);
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

/** Read by both processes. Holds no secrets. */
export const SharedEnv = z.object({
  DATABASE_PATH: z.string().default("./data/chupke.db"),
  SHOP_UA: optionalString,
  DEMO_ZAT_PER_USD: int(100000),
  MAX_ORDER_USD: num(10),
  MAX_DAILY_USD: num(30),
  MIN_CONFIRMATIONS: int(1),
  ORDER_TTL_MIN: int(20),
  GRACE_MIN: int(10),
  PURGE_AFTER_MIN: int(60),
  PAUSE_PURCHASES: bool("false"),
  ALLOWLIST_PATH: z.string().default("./config/allowlist.json"),
});

/** Worker only: the wallet, the Bitrefill key and the state machine. */
export const WorkerEnv = SharedEnv.extend({
  BITREFILL_API_KEY: optionalString,
  BITREFILL_BASE_URL: z.string().url().default("https://api.bitrefill.com/v2"),
  ALLOW_REAL_PURCHASES: bool("false"),
  ZINGO_CLI_PATH: z.string().default("./bin/zingo-cli"),
  ZINGO_SEED: optionalString,
  ZINGO_NYM_PROXY: optionalString,
  ZINGO_EXTRA_CA_FILE: optionalString,
  WALLET_MODE: z.enum(["single", "split"]).default("single"),
  SHOP_WALLET_DIR: z.string().default("./data/wallets/shop"),
  INBOX_WALLET_DIR: z.string().default("./data/wallets/inbox"),
  BUYER_WALLET_DIR: z.string().default("./data/wallets/buyer"),
  SHOP_UFVK: optionalString,
  WALLET_BIRTHDAY: z.coerce.number().int().positive().optional(),
  LIGHTWALLETD_URL: z.string().url().default("https://testnet.zec.rocks:443"),
  DELIVERY_AMOUNT_ZAT: int(1000),
  DUST_ZAT: int(20000),
  TICK_MS: int(10000),
});

/** Web only. Must never see worker secrets. */
export const WebEnv = SharedEnv.extend({
  PORT: int(8080),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),
  DASHBOARD_PASSWORD: optionalString,
});

export type SharedConfig = z.infer<typeof SharedEnv>;
export type WorkerConfig = z.infer<typeof WorkerEnv>;
export type WebConfig = z.infer<typeof WebEnv>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return WorkerEnv.parse(env);
}

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  return WebEnv.parse(env);
}

export const AllowlistEntry = z.object({
  sku: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(["test", "real"]),
  label: z.string().min(1).max(60),
  product_id: z.string().min(1),
  package_id: z.string().min(1).optional(),
  value: z.number().positive().optional(),
  value_usd: z.number().positive(),
});
export type AllowlistEntry = z.infer<typeof AllowlistEntry>;

export function loadAllowlist(path: string): AllowlistEntry[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const list = z.array(AllowlistEntry).parse(raw);
  const skus = new Set<string>();
  for (const e of list) {
    if (skus.has(e.sku)) throw new Error(`duplicate sku in allowlist: ${e.sku}`);
    if (!e.package_id && e.value === undefined) throw new Error(`allowlist ${e.sku}: needs package_id or value`);
    skus.add(e.sku);
  }
  return list;
}
