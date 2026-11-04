/**
 * Testnet unified address checks for reply addresses: "utest1" prefix, lowercase bech32 charset,
 * a length that keeps the payment memo within 512 bytes, and a valid Bech32m checksum
 * (unified addresses are Bech32m without the 90-char limit, ZIP 316).
 */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32M_CONST = 0x2bc830a3;

/** "CHUPKE1 o=<10> r=" is 23 bytes, so a reply UA may be at most 512 - 23 = 489 chars. */
export const MAX_REPLY_UA_LEN = 489;
export const UA_TESTNET_RE = /^utest1[02-9ac-hj-np-z]+$/;

export function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ GEN[i]!) >>> 0;
  }
  return chk;
}

export function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

export function bech32mChecksumOk(s: string): boolean {
  const pos = s.lastIndexOf("1");
  if (pos < 1 || pos + 7 > s.length) return false;
  const hrp = s.slice(0, pos);
  const values: number[] = [];
  for (const c of s.slice(pos + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return false;
    values.push(v);
  }
  return polymod([...hrpExpand(hrp), ...values]) === BECH32M_CONST;
}

export type AddressProblem = "empty" | "not_testnet_unified" | "charset" | "too_short" | "too_long" | "checksum";

/** Returns null when `ua` is acceptable as a reply address, else the first problem found. */
export function replyAddressProblem(ua: string): AddressProblem | null {
  if (ua.length === 0) return "empty";
  if (!ua.startsWith("utest1")) return "not_testnet_unified";
  if (!UA_TESTNET_RE.test(ua)) return "charset";
  if (ua.length < 60) return "too_short";
  if (ua.length > MAX_REPLY_UA_LEN) return "too_long";
  if (!bech32mChecksumOk(ua)) return "checksum";
  return null;
}

export function isReplyAddress(ua: string): boolean {
  return replyAddressProblem(ua) === null;
}

export function shortAddress(ua: string): string {
  return ua.length <= 14 ? ua : `${ua.slice(0, 8)}…`;
}
