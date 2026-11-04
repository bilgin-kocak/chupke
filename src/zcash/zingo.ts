import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Logger } from "pino";
import { z } from "zod";
import { log as defaultLog, scrub } from "../log.js";
import {
  SendNotBroadcastError,
  WalletCommandError,
  paymentKey,
  type IncomingOutput,
  type NewAddress,
  type Pool,
  type SentOutput,
  type WalletBalance,
  type WalletInfo,
  type ZcashWallet,
} from "./wallet.js";

/**
 * ZcashWallet over zingo-cli 0.5.0 in one-shot mode (one process per call). Findings behind the
 * flag choices are in docs/WALLET.md:
 * - `--server` grants online consent; local reads run `--offline` (no network).
 * - `--waitsync` only terminates for wallets *created* with `--waitsync` (zingolib persists
 *   `shutdown_on_completion` in the wallet file), so `initWallet` always creates that way.
 * - stdout carries exactly the command result; errors go to stderr with a non-zero exit.
 * Never logs stdout/stderr: only the command name, exit code and duration.
 */
export interface ZingoOptions {
  cliPath: string;
  dataDir: string;
  server: string;
  chain?: "testnet" | "mainnet" | "regtest";
  extraCaFile?: string | undefined;
  timeoutMs?: number;
  logger?: Logger;
}

const WALLET_FILE = "zingo-wallet.dat";
const LOCK_FILE = ".chupke-zingo.lock";

/** One async mutex per wallet directory, shared by every instance in this process. */
const dirQueues = new Map<string, Promise<unknown>>();
function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = dirQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  dirQueues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Cross-process guard: never two zingo-cli processes on one wallet directory.
 * The lock file lists the owner's PID and, once spawned, its zingo-cli child's PID. It is stale only
 * when every listed process is gone: if a worker is killed (kill -9) mid-send, its orphaned zingo-cli
 * may still be broadcasting and saving the wallet, and a restarted worker must wait for it.
 */
export async function withDirLock<T>(dir: string, timeoutMs: number, fn: (registerChild: (pid: number) => void) => Promise<T>): Promise<T> {
  const path = join(dir, LOCK_FILE);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let pids: number[] = [];
      try {
        pids = readFileSync(path, "utf8").trim().split(/\s+/).map(Number).filter(Number.isInteger);
      } catch {
        continue; // released between our write and read
      }
      // Our own PID can only be a leftover (calls are serialized in-process); our child may still be exiting.
      const alive = pids.filter((p) => p !== process.pid && p > 0 && pidAlive(p));
      if (alive.length === 0) {
        try {
          unlinkSync(path);
        } catch {
          /* someone else removed it */
        }
        continue;
      }
      if (Date.now() > deadline) throw new Error(`wallet dir ${dir} is locked by pid ${alive.join(",")}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const registerChild = (pid: number) => writeFileSync(path, `${process.pid} ${pid}`);
  try {
    return await fn(registerChild);
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* already gone */
    }
  }
}

function extractJson(stdout: string): unknown {
  const start = stdout.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in output");
  return JSON.parse(stdout.slice(start));
}

// ---------------------------------------------------------------------------------------------
// Output schemas (zingo-cli 0.5.0)
// ---------------------------------------------------------------------------------------------

const InfoOut = z.looseObject({ latest_block_height: z.number().int(), chain_name: z.string() });
const HeightOut = z.looseObject({ height: z.number().int() });
const SpendableOut = z.looseObject({ spendable_balance: z.number().int() });
const AddressesOut = z.array(
  z.looseObject({ address_index: z.number().int(), encoded_address: z.string(), has_transparent: z.boolean().optional() }),
);
const NewAddressOut = z.looseObject({
  address_index: z.number().int().nonnegative(),
  encoded_address: z.string(),
  has_transparent: z.boolean(),
});
const NoteOut = z.looseObject({
  value: z.number().int(),
  status: z.string(),
  spend_status: z.string().optional(),
  memo: z.string().nullable().optional(),
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  output_index: z.number().int().nullable().optional(),
  scope: z.string().optional(),
});
const NotesOut = z.looseObject({
  ironwood_notes: z.looseObject({ note_summaries: z.array(NoteOut) }).optional(),
  orchard_notes: z.looseObject({ note_summaries: z.array(NoteOut) }).optional(),
  sapling_notes: z.looseObject({ note_summaries: z.array(NoteOut) }).optional(),
});
const MessagesOut = z.looseObject({
  value_transfers: z.array(
    z.looseObject({
      txid: z.string(),
      kind: z.string(),
      value: z.number().int(),
      recipient_address: z.string().nullable().optional(),
      memos: z.array(z.string()).optional(),
      status: z.string().optional(),
      blockheight: z.number().int().optional(),
    }),
  ),
});
const SendOut = z.looseObject({ txids: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1) });
const UfvkOut = z.looseObject({ ufvk: z.string(), birthday: z.number().int() });

/**
 * Error text proving a quicksend built and broadcast nothing: a refusal at the proposal stage, or
 * (Nym build) a session that never went online because Mixnet Mode couldn't start. zingo-cli raises
 * the latter while starting the session, before its pre-send sync, so the send never ran.
 */
export function sendNeverRan(errorText: string): boolean {
  return /Propose send error|Insufficient balance|Mixnet Mode is required for a connected session/.test(errorText);
}

/**
 * `balance` is not JSON: it prints "total_<pool>_balance: 100_000_000" lines (underscore digit
 * separators) for ironwood, orchard, sapling and transparent. Returns the sum in zatoshis.
 */
export function parseBalanceTotal(text: string): number {
  let total = 0;
  for (const m of text.matchAll(/total_[a-z]+_balance:\s*([\d_]+)/g)) total += Number(m[1]!.replaceAll("_", ""));
  return total;
}

/** "confirmed at block height 4581215" -> 4581215; mempool/transmitted/calculated -> null. */
export function minedHeightFromStatus(status: string): number | null {
  const m = /^confirmed at block height (\d+)$/.exec(status.trim());
  return m ? Number(m[1]) : null;
}

type SyncMode = "wait" | "nosync" | "offline";

export class ZingoWallet implements ZcashWallet {
  private readonly dir: string;
  private readonly timeoutMs: number;
  private readonly log: Logger;

  constructor(private readonly opts: ZingoOptions) {
    this.dir = resolve(opts.dataDir);
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.log = opts.logger ?? defaultLog;
  }

  get dataDir(): string {
    return this.dir;
  }

  walletExists(): boolean {
    return existsSync(join(this.dir, WALLET_FILE));
  }

  /**
   * Create (or restore, when `seed` is given) the wallet. Always with --waitsync, so later
   * --waitsync calls terminate. The seed travels in ZINGO_SEED, never on the command line.
   */
  async initWallet(restore?: { seed: string; birthday: number } | { viewkey: string; birthday: number }): Promise<void> {
    if (this.walletExists()) throw new Error(`wallet already exists in ${this.dir}`);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const extra: string[] = restore ? ["--birthday", String(restore.birthday)] : [];
    let env: Record<string, string> | undefined;
    if (restore && "seed" in restore) env = { ZINGO_SEED: restore.seed };
    // zingo-cli has no environment variable for a viewing key, so it goes on the command line
    // (visible in the local process list while the init runs; docs/WALLET.md notes this).
    if (restore && "viewkey" in restore) extra.push("--viewkey", restore.viewkey);
    await this.run("init", "wait", [...extra, "addresses"], { allowMissingWallet: true, env });
  }

  async info(): Promise<WalletInfo> {
    const server = InfoOut.parse(extractJson(await this.run("info", "nosync", ["info"])));
    const wallet = HeightOut.parse(extractJson(await this.run("height", "offline", ["height"])));
    return { chainHeight: server.latest_block_height, walletHeight: wallet.height };
  }

  async sync(timeoutMs?: number): Promise<void> {
    await this.run("sync", "wait", ["height"], { timeoutMs });
  }

  /**
   * Full rescan: drop every note, coin and transaction, then sync again from the birthday.
   * (`rescan` itself restarts sync inside one process, which one-shot mode would abandon.)
   */
  async rescan(timeoutMs = 600_000): Promise<void> {
    await this.run("clear", "nosync", ["clear"]);
    await this.run("sync", "wait", ["height"], { timeoutMs });
  }

  async primaryAddress(): Promise<string> {
    const list = AddressesOut.parse(extractJson(await this.run("addresses", "offline", ["addresses"])));
    const first = list.find((a) => a.address_index === 0) ?? list[0];
    if (!first) throw new WalletCommandError("addresses", 0, "wallet has no unified address");
    return first.encoded_address;
  }

  /** `new_address o`: an Orchard-receiver-only address (payments to it land in the Ironwood pool on NU7). */
  async newAddress(): Promise<NewAddress> {
    const out = NewAddressOut.parse(extractJson(await this.run("new_address", "offline", ["new_address", "o"])));
    if (out.has_transparent) throw new WalletCommandError("new_address", 0, "new address carries a transparent receiver");
    return { address: out.encoded_address, index: out.address_index };
  }

  async balance(): Promise<WalletBalance> {
    const spendable = SpendableOut.parse(extractJson(await this.run("spendable_balance", "offline", ["spendable_balance"])));
    const text = await this.run("balance", "offline", ["balance"]);
    return { spendableZat: spendable.spendable_balance, totalZat: parseBalanceTotal(text) };
  }

  async chainHeightFromWallet(): Promise<number> {
    return HeightOut.parse(extractJson(await this.run("height", "offline", ["height"]))).height;
  }

  /** Received shielded outputs (external scope; change is excluded), spent ones included. */
  async listIncoming(): Promise<IncomingOutput[]> {
    const tip = await this.chainHeightFromWallet();
    const notes = NotesOut.parse(extractJson(await this.run("notes", "offline", ["notes", "all"])));
    const pools: Array<[Pool, z.infer<typeof NoteOut>[]]> = [
      ["ironwood", notes.ironwood_notes?.note_summaries ?? []],
      ["orchard", notes.orchard_notes?.note_summaries ?? []],
      ["sapling", notes.sapling_notes?.note_summaries ?? []],
    ];
    const out: IncomingOutput[] = [];
    for (const [pool, list] of pools) {
      for (const n of list) {
        if (n.scope !== undefined && n.scope !== "external") continue;
        const minedHeight = minedHeightFromStatus(n.status);
        const memo = n.memo && n.memo.length > 0 ? n.memo : null;
        const base = { txid: n.txid, pool, outputIndex: n.output_index ?? null, amountZat: n.value, memo };
        out.push({
          ...base,
          key: paymentKey(base),
          minedHeight,
          confirmations: minedHeight === null ? 0 : Math.max(0, tip - minedHeight + 1),
        });
      }
    }
    return out;
  }

  /** Memo-bearing sends (every Chupke delivery and refund carries a memo). */
  async listSent(): Promise<SentOutput[]> {
    const msgs = MessagesOut.parse(extractJson(await this.run("messages", "offline", ["messages"])));
    return msgs.value_transfers
      .filter((v) => v.kind === "sent")
      .map((v) => ({
        txid: v.txid,
        to: v.recipient_address ?? null,
        amountZat: v.value,
        memo: v.memos && v.memos.length > 0 ? v.memos.join("\n") : null,
      }));
  }

  /** Money-moving. Syncs first so the proposal uses fresh anchors; fees per ZIP 317 by the wallet. */
  async send(to: string, amountZat: number, memo: string): Promise<{ txid: string }> {
    if (!Number.isInteger(amountZat) || amountZat <= 0) throw new Error("amountZat must be a positive integer");
    const payload = JSON.stringify([{ address: to, amount: amountZat, memo }]);
    const out = SendOut.parse(extractJson(await this.run("quicksend", "wait", ["quicksend", payload])));
    return { txid: out.txids[0]! };
  }

  /** Secret: the caller must never log the returned key. */
  async exportUfvk(): Promise<{ ufvk: string; birthday: number }> {
    return UfvkOut.parse(extractJson(await this.run("export_ufvk", "offline", ["export_ufvk"])));
  }

  private run(
    name: string,
    mode: SyncMode,
    commandArgs: string[],
    extra: { allowMissingWallet?: boolean; env?: Record<string, string> | undefined; timeoutMs?: number | undefined } = {},
  ): Promise<string> {
    if (!extra.allowMissingWallet && !this.walletExists()) {
      return Promise.reject(new WalletCommandError(name, null, `no wallet in ${this.dir}; run initWallet first`));
    }
    const timeoutMs = extra.timeoutMs ?? this.timeoutMs;
    return serialize(this.dir, () =>
      withDirLock(this.dir, timeoutMs, (registerChild) => this.spawnOnce(name, mode, commandArgs, extra.env, timeoutMs, registerChild)),
    );
  }

  private spawnOnce(
    name: string,
    mode: SyncMode,
    commandArgs: string[],
    extraEnv: Record<string, string> | undefined,
    timeoutMs: number,
    registerChild: (pid: number) => void,
  ): Promise<string> {
    const args = ["--chain", this.opts.chain ?? "testnet", "--data-dir", this.dir];
    if (mode === "offline") args.push("--offline");
    else args.push("--server", this.opts.server, mode === "wait" ? "--waitsync" : "--nosync");
    args.push(...commandArgs);

    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
    delete env.ZINGO_SEED; // only ever passed explicitly for a restore
    delete env.RUST_LOG; // tracing output must not mix into stdout
    if (this.opts.extraCaFile) env.ZINGO_EXTRA_CA_FILE = this.opts.extraCaFile;
    Object.assign(env, extraEnv);

    const t0 = Date.now();
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.opts.cliPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
      if (child.pid !== undefined) registerChild(child.pid);
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (d: Buffer) => out.push(d));
      child.stderr.on("data", (d: Buffer) => err.push(d));
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        this.log.error({ cmd: name, ms: Date.now() - t0 }, "zingo-cli failed to start");
        reject(new WalletCommandError(name, null, `failed to start zingo-cli: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const ms = Date.now() - t0;
        this.log[code === 0 && !timedOut ? "debug" : "warn"]({ cmd: name, exitCode: code, ms, timedOut }, "zingo-cli");
        if (timedOut) return reject(new WalletCommandError(name, code, `zingo-cli ${name} timed out after ${timeoutMs} ms`));
        if (code !== 0) {
          // Keep only the "Error:" lines, scrubbed of addresses and keys, and short.
          const why = Buffer.concat(err)
            .toString("utf8")
            .split("\n")
            .filter((l) => /^\s*(Error|error|caused by)/.test(l))
            .join(" | ");
          const message = `zingo-cli ${name} exited ${code}: ${scrub(why).slice(0, 300) || "no error text"}`;
          // Nothing was built or broadcast: safe to retry without the look-before-resend guard.
          if (name === "quicksend" && sendNeverRan(why)) {
            return reject(new SendNotBroadcastError(name, code, message));
          }
          return reject(new WalletCommandError(name, code, message));
        }
        resolvePromise(Buffer.concat(out).toString("utf8"));
      });
    });
  }
}
