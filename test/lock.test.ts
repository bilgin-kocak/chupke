import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withDirLock } from "../src/zcash/zingo.js";

const LOCK = ".chupke-zingo.lock";

describe("wallet directory lock", () => {
  it("takes over a lock whose processes are all gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chupke-lock-"));
    writeFileSync(join(dir, LOCK), "999999 999998");
    const t0 = Date.now();
    await withDirLock(dir, 5_000, async () => undefined);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("waits while an orphaned zingo-cli child of a dead worker is still running", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chupke-lock-"));
    const orphan = spawn("sleep", ["1.2"]); // stands in for a zingo-cli still broadcasting after kill -9
    writeFileSync(join(dir, LOCK), `999999 ${orphan.pid}`); // dead worker PID + live child PID
    const t0 = Date.now();
    await withDirLock(dir, 10_000, async () => undefined);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  });

  it("records the child PID while a command runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chupke-lock-"));
    let seen = "";
    await withDirLock(dir, 5_000, async (registerChild) => {
      registerChild(4242);
      seen = readFileSync(join(dir, LOCK), "utf8");
    });
    expect(seen).toBe(`${process.pid} 4242`);
  });
});
