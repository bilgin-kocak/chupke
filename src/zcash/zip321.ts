/**
 * ZIP 321 payment request URIs, the subset Chupke uses:
 *   zcash:<address>?amount=<ZEC, ≤ 8 decimals, no exponent>&memo=<base64url, no padding>&message=<urlencoded>
 */
const ZAT_PER_ZEC = 100_000_000n;

/** 1000000 -> "0.01", 100000000 -> "1", 1 -> "0.00000001". */
export function zatToZec(zat: number): string {
  if (!Number.isSafeInteger(zat) || zat < 0) throw new Error("zatoshis must be a non-negative safe integer");
  const z = BigInt(zat);
  const whole = z / ZAT_PER_ZEC;
  const frac = (z % ZAT_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function zecToZat(zec: string): number {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(zec);
  if (!m) throw new Error("invalid ZIP 321 amount");
  const zat = BigInt(m[1]!) * ZAT_PER_ZEC + BigInt((m[2] ?? "").padEnd(8, "0") || "0");
  if (zat > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount too large");
  return Number(zat);
}

export function memoToBase64Url(memo: string): string {
  return Buffer.from(memo, "utf8").toString("base64url"); // Node's base64url omits padding
}

export function memoFromBase64Url(b64: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(b64)) throw new Error("memo is not base64url without padding");
  return Buffer.from(b64, "base64url").toString("utf8");
}

export function buildPaymentUri(p: { address: string; amountZat: number; memo: string; message?: string }): string {
  let uri = `zcash:${p.address}?amount=${zatToZec(p.amountZat)}&memo=${memoToBase64Url(p.memo)}`;
  if (p.message) uri += `&message=${encodeURIComponent(p.message)}`;
  return uri;
}

export function parsePaymentUri(uri: string): { address: string; amountZat: number; memo: string | null; message: string | null } {
  const m = /^zcash:([0-9a-z]+)(?:\?(.*))?$/.exec(uri.trim());
  if (!m) throw new Error("not a single-recipient zcash: URI");
  const params = new Map<string, string>();
  for (const part of (m[2] ?? "").split("&").filter(Boolean)) {
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    if (params.has(key)) throw new Error(`duplicate parameter ${key}`);
    params.set(key, eq < 0 ? "" : part.slice(eq + 1));
  }
  const amount = params.get("amount");
  if (amount === undefined) throw new Error("amount is required");
  const memo = params.get("memo");
  const message = params.get("message");
  return {
    address: m[1]!,
    amountZat: zecToZat(amount),
    memo: memo === undefined ? null : memoFromBase64Url(memo),
    message: message === undefined ? null : decodeURIComponent(message),
  };
}
