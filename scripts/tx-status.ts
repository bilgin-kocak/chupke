/**
 * Check a transaction on chain through lightwalletd's GetTransaction gRPC call (no explorer needed).
 *
 *   npx tsx scripts/tx-status.ts <txid> [<txid> ...]
 *
 * Prints the mined height (0 or absent = mempool), confirmations and raw size. It never decodes or
 * prints transaction contents.
 */
import http2 from "node:http2";
import { loadDotEnv, loadWorkerConfig } from "../src/config.js";

loadDotEnv();
const cfg = loadWorkerConfig();
const SERVICE = "/cash.z.wallet.sdk.rpc.CompactTxStreamer/";

function frame(body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
}

function unary(client: http2.ClientHttp2Session, method: string, body: Buffer): Promise<{ data: Buffer; status: string; message: string }> {
  return new Promise((resolve, reject) => {
    const req = client.request({ ":method": "POST", ":path": SERVICE + method, "content-type": "application/grpc", te: "trailers" });
    const chunks: Buffer[] = [];
    let status = "";
    let message = "";
    req.on("response", (h) => {
      if (h["grpc-status"] !== undefined) status = String(h["grpc-status"]);
      if (h["grpc-message"] !== undefined) message = String(h["grpc-message"]);
    });
    req.on("trailers", (t) => {
      status = String(t["grpc-status"] ?? status);
      message = decodeURIComponent(String(t["grpc-message"] ?? message));
    });
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("error", reject);
    req.on("end", () => resolve({ data: Buffer.concat(chunks).subarray(5), status, message }));
    req.end(frame(body));
  });
}

function readVarint(b: Buffer, i: number): [bigint, number] {
  let r = 0n;
  let s = 0n;
  for (;;) {
    const x = b[i++]!;
    r |= BigInt(x & 0x7f) << s;
    s += 7n;
    if (!(x & 0x80)) return [r, i];
  }
}

/** Minimal protobuf field reader: varints and length-delimited fields only. */
function fields(b: Buffer): Map<number, bigint | Buffer> {
  const out = new Map<number, bigint | Buffer>();
  let i = 0;
  while (i < b.length) {
    let tag: bigint;
    [tag, i] = readVarint(b, i);
    const f = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 0) {
      let v: bigint;
      [v, i] = readVarint(b, i);
      out.set(f, v);
    } else if (wire === 2) {
      let len: bigint;
      [len, i] = readVarint(b, i);
      out.set(f, b.subarray(i, i + Number(len)));
      i += Number(len);
    } else break;
  }
  return out;
}

const txids = process.argv.slice(2);
if (txids.length === 0 || !txids.every((t) => /^[0-9a-f]{64}$/.test(t))) {
  console.error("usage: tx-status <txid-hex> [...]");
  process.exit(2);
}

const client = http2.connect(cfg.LIGHTWALLETD_URL);
client.on("error", (e) => {
  console.error(`lightwalletd connection error: ${e.message}`);
  process.exit(1);
});
const latest = await unary(client, "GetLatestBlock", Buffer.alloc(0));
const tip = Number(fields(latest.data).get(1) ?? 0n);
console.log(`lightwalletd ${cfg.LIGHTWALLETD_URL} tip ${tip}`);

for (const txid of txids) {
  // TxFilter.hash (field 3) takes the txid in internal byte order: the reverse of display hex.
  let found = false;
  for (const hash of [Buffer.from(txid, "hex").reverse(), Buffer.from(txid, "hex")]) {
    const body = Buffer.concat([Buffer.from([0x1a, 0x20]), hash]);
    const r = await unary(client, "GetTransaction", body);
    if (r.status !== "0") continue;
    const f = fields(r.data);
    const raw = f.get(1);
    const height = Number(f.get(2) ?? 0n);
    const mined = height > 0 && height < 2 ** 32 - 1;
    console.log(
      `${txid}: ${mined ? `mined at ${height}, ${tip - height + 1} confirmation(s)` : "in mempool (not mined yet)"}, ${Buffer.isBuffer(raw) ? raw.length : 0} bytes`,
    );
    found = true;
    break;
  }
  if (!found) console.log(`${txid}: not found by lightwalletd`);
}
client.close();
