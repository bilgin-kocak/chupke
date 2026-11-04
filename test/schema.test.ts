import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/schema.js";

describe("schema", () => {
  it("adds the columns an older database lacks, in place", () => {
    const path = join(mkdtempSync(join(tmpdir(), "chupke-db-")), "old.db");
    const before = openDb(path);
    before.exec("ALTER TABLE orders DROP COLUMN pay_ua; ALTER TABLE payments DROP COLUMN excess_txid;");
    before.close();
    const db = openDb(path);
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols("orders")).toContain("pay_ua");
    expect(cols("payments")).toContain("excess_txid");
    expect(cols("address_pool")).toEqual(["address", "address_index", "shop_ua", "created_at", "order_id", "claimed_at"]);
    db.close();
  });
});
