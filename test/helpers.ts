import { randomInt } from "node:crypto";
import { hrpExpand, polymod } from "../src/zcash/address.js";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** A syntactically valid Bech32m "utest1…" string (random payload, correct checksum). Not a real address. */
export function fakeUa(dataLen = 100, hrp = "utest"): string {
  const data = Array.from({ length: dataLen }, () => randomInt(32));
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum = Array.from({ length: 6 }, (_, p) => (mod >>> (5 * (5 - p))) & 31);
  return `${hrp}1${[...data, ...checksum].map((v) => CHARSET[v]).join("")}`;
}

export const TXID_A = "a".repeat(64);
export const TXID_B = "b".repeat(64);
export const TXID_C = "c".repeat(64);
