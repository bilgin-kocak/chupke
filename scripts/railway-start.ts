/**
 * Railway entry point: the worker and the web in one container.
 *
 * docker-compose.yml runs them as two containers that share only the database volume. Railway can't share a
 * volume between two services, so there they run in one service with one volume, and this keeps the same
 * split inside the container:
 *   - the worker runs as root (Railway mounts volumes owned by root, hence RAILWAY_RUN_UID=0) with every
 *     variable, and keeps the wallets in a directory only root can read;
 *   - the web runs as the unprivileged `chupke` user with only the variables WebEnv names, so it can read
 *     neither the wallets nor the worker's secrets.
 * A stop signal goes to both, and the worker finishes its current tick first. If either process exits on its
 * own, the other is stopped and the container exits non-zero, so Railway restarts both.
 *
 *   start command: node_modules/.bin/tsx scripts/railway-start.ts      (docs/DEPLOY.md, "Railway")
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, chownSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WebEnv } from "../src/config.js";

/** Process basics the web needs besides its own settings. */
const BASE_KEYS = ["PATH", "NODE_ENV", "LOG_LEVEL", "TZ", "LANG"];

/** The web's environment: only what WebEnv reads, so no worker secret can reach it. */
export function webEnv(env: NodeJS.ProcessEnv, databasePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [...BASE_KEYS, ...Object.keys(WebEnv.shape)]) {
    const v = env[k];
    if (v !== undefined) out[k] = v;
  }
  out.DATABASE_PATH = databasePath;
  out.HOME = "/tmp";
  return out;
}

function say(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: 30, time: Date.now(), name: "railway-start", ...extra, msg }));
}

function fail(msg: string): never {
  console.log(JSON.stringify({ level: 60, time: Date.now(), name: "railway-start", msg }));
  process.exit(1);
}

function lookupUser(name: string): { uid: number; gid: number } {
  for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
    const f = line.split(":");
    if (f[0] === name) return { uid: Number(f[2]), gid: Number(f[3]) };
  }
  return fail(`no user ${name} in /etc/passwd`);
}

function main(): void {
  const data = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!data) fail("no volume: attach one to this service, or the wallets are lost on every deploy");
  if (process.getuid?.() !== 0) fail("must start as root to own the volume: set RAILWAY_RUN_UID=0");
  const web = lookupUser("chupke");

  // The volume root only needs to be passable for the web (no listing).
  chmodSync(data, 0o711);
  const walletsDir = join(data, "wallets");
  mkdirSync(walletsDir, { recursive: true });
  chownSync(walletsDir, 0, 0);
  chmodSync(walletsDir, 0o700);

  // The database belongs to the web user. The worker (root) can write it anyway, and SQLite running as root
  // hands its -wal/-shm files to the database file's owner, so the web can always open them.
  const dbDir = join(data, "db");
  const dbPath = join(dbDir, "chupke.db");
  mkdirSync(dbDir, { recursive: true });
  if (!existsSync(dbPath)) closeSync(openSync(dbPath, "a")); // an empty file is an empty SQLite database
  chownSync(dbDir, web.uid, web.gid);
  chmodSync(dbDir, 0o700);
  for (const f of readdirSync(dbDir)) chownSync(join(dbDir, f), web.uid, web.gid);

  const tsx = resolve("node_modules/.bin/tsx");
  const children: [string, ChildProcess][] = [
    [
      "worker",
      spawn(tsx, ["src/worker.ts"], {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_PATH: dbPath,
          SHOP_WALLET_DIR: join(walletsDir, "shop"),
          INBOX_WALLET_DIR: join(walletsDir, "inbox"),
        },
      }),
    ],
    ["web", spawn(tsx, ["src/web/server.ts"], { stdio: "inherit", env: webEnv(process.env, dbPath), uid: web.uid, gid: web.gid })],
  ];

  let stopping = false;
  let exitCode = 0;
  let running = children.length;
  const stopAll = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    for (const [, c] of children) if (c.exitCode === null && c.signalCode === null) c.kill(signal);
  };
  process.on("SIGTERM", () => stopAll("SIGTERM"));
  process.on("SIGINT", () => stopAll("SIGINT"));

  for (const [name, c] of children) {
    let done = false;
    const exited = (detail: Record<string, unknown>): void => {
      if (done) return;
      done = true;
      running -= 1;
      if (!stopping) {
        say(`${name} exited on its own; stopping the other process`, detail);
        exitCode = 1;
        stopAll("SIGTERM");
      }
      if (running === 0) process.exit(exitCode);
    };
    c.on("exit", (code, signal) => exited({ code, signal }));
    c.on("error", (e) => exited({ err: e.message }));
  }
  say("started", { data, webUid: web.uid });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
