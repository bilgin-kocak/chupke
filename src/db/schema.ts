import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

/**
 * One SQLite file in WAL mode, shared by web (orders, reads) and worker (everything else).
 * Timestamps are unix milliseconds. Columns follow SPEC §4; extras are marked.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  sku           TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- extra: test | real (allowlist snapshot)
  product_id    TEXT NOT NULL,
  package_id    TEXT,
  value         REAL,
  value_usd     REAL NOT NULL,
  label         TEXT NOT NULL,
  price_zat     INTEGER NOT NULL,
  reply_ua      TEXT,                       -- purged PURGE_AFTER_MIN after terminal (I7)
  pay_ua        TEXT,                       -- extra: this order's own shop address (address_pool); NULL = shop primary UA
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  status        TEXT NOT NULL,              -- awaiting_payment | fulfilling | delivered | refunded | expired | held
  terminal_at   INTEGER,                    -- extra
  updated_at    INTEGER NOT NULL            -- extra
);

CREATE TABLE IF NOT EXISTS payments (
  key             TEXT PRIMARY KEY,         -- "<txid>:<pool>:<outputIndex>" (I1)
  txid            TEXT NOT NULL,
  pool            TEXT NOT NULL,            -- extra
  output_index    INTEGER,                  -- extra
  order_id        TEXT,
  amount_zat      INTEGER NOT NULL,
  memo_ok         INTEGER NOT NULL,
  reply_ua        TEXT,                     -- from the PAID memo (I5)
  first_seen_at   INTEGER NOT NULL,
  mined_height    INTEGER,
  confirmations   INTEGER NOT NULL DEFAULT 0,
  state           TEXT NOT NULL,            -- seen | confirmed | accepted | refund_pending | refund_sending | refunded | held | ignored_dust
  reason          TEXT,
  refund_txid     TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  send_started_at INTEGER,                  -- extra: set (committed) right before a refund send
  updated_at      INTEGER NOT NULL,
  -- extra: overpayment refund of the excess above the price, after a successful delivery
  excess_zat             INTEGER,
  excess_state           TEXT,              -- NULL | pending | sending | refunded | held
  excess_txid            TEXT,
  excess_attempts        INTEGER NOT NULL DEFAULT 0,
  excess_next_attempt_at INTEGER NOT NULL DEFAULT 0,
  excess_send_started_at INTEGER
);
CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS payments_state ON payments(state);

CREATE TABLE IF NOT EXISTS fulfillments (
  order_id        TEXT PRIMARY KEY,         -- each order is bought at most once, ever (I2)
  payment_key     TEXT NOT NULL UNIQUE,
  state           TEXT NOT NULL,            -- claimed | invoice_created | paying | paid | delivered | delivery_sending | memo_sent | failed
  invoice_id      TEXT,
  br_order_ids    TEXT,                     -- JSON array
  invoice_status  TEXT,
  delivery_txid   TEXT,
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,         -- extra
  spend_at        INTEGER,                  -- extra: set when "paying" is committed (daily cap)
  send_started_at INTEGER,                  -- extra: set (committed) right before the delivery send
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  order_id    TEXT,
  payment_key TEXT,
  type        TEXT NOT NULL,
  detail      TEXT                           -- redacted: never codes, addresses, memos or keys
);
CREATE INDEX IF NOT EXISTS events_order ON events(order_id);

-- extra: per-order diversified addresses (ZIP 316). The worker derives them ahead of time (it holds the
-- wallet); the web, which holds no keys, hands each order the lowest free one. An address is never reused.
CREATE TABLE IF NOT EXISTS address_pool (
  address        TEXT PRIMARY KEY,
  address_index  INTEGER NOT NULL,
  shop_ua        TEXT NOT NULL,             -- primary UA of the wallet that derived it
  created_at     INTEGER NOT NULL,
  order_id       TEXT UNIQUE,               -- set once, when an order claims it
  claimed_at     INTEGER
);
CREATE INDEX IF NOT EXISTS address_pool_free ON address_pool(shop_ua, order_id, address_index);

CREATE TABLE IF NOT EXISTS kv (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export type DB = Database.Database;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Columns added after the first deploy; ALTER TABLE for databases created before them. */
const ADDED_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ["orders", "pay_ua", "TEXT"],
  ["payments", "excess_zat", "INTEGER"],
  ["payments", "excess_state", "TEXT"],
  ["payments", "excess_txid", "TEXT"],
  ["payments", "excess_attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["payments", "excess_next_attempt_at", "INTEGER NOT NULL DEFAULT 0"],
  ["payments", "excess_send_started_at", "INTEGER"],
];

function migrate(db: DB): void {
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) continue;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    } catch (e) {
      // The other process (web or worker) may have added it a moment ago.
      if (!/duplicate column/i.test((e as Error).message)) throw e;
    }
  }
}
