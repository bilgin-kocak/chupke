import { randomInt } from "node:crypto";

/** Crockford base32 (no I, L, O, U). */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ORDER_ID_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** 10-char Crockford base32 order id (50 random bits). */
export function newOrderId(): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += CROCKFORD[randomInt(32)];
  return id;
}

export function isOrderId(s: string): boolean {
  return ORDER_ID_RE.test(s);
}
