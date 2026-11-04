/**
 * Bitrefill's GET /orders/{id} returns `redemption_info`, documented as a string in the OpenAPI
 * and as an object {code, link, pin, instructions} in Bitrefill's agent skill. Normalize both.
 * Values here are secrets: hold them in memory only (invariant I6) and never log them.
 */
export interface Redemption {
  code: string | null;
  pin: string | null;
  link: string | null;
  instructions: string | null;
}

const CODE_KEYS = ["code", "redemption_code", "card_code", "voucher_code", "serial", "barcode_value"];
const PIN_KEYS = ["pin", "pin_code", "card_pin"];
const LINK_KEYS = ["link", "url", "redeem_url", "redemption_link", "redemption_url", "claim_url"];
const INSTRUCTION_KEYS = ["instructions", "other", "extra_info", "info"];

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

export function normalizeRedemption(raw: unknown): Redemption {
  const empty: Redemption = { code: null, pin: null, link: null, instructions: null };
  if (raw === null || raw === undefined) return empty;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return empty;
    if (s.startsWith("{")) {
      try {
        return normalizeRedemption(JSON.parse(s) as unknown);
      } catch {
        /* fall through: treat as a plain string */
      }
    }
    return looksLikeUrl(s) ? { ...empty, link: s } : { ...empty, code: s };
  }
  if (Array.isArray(raw)) return raw.length > 0 ? normalizeRedemption(raw[0]) : empty;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const r: Redemption = {
      code: pick(obj, CODE_KEYS),
      pin: pick(obj, PIN_KEYS),
      link: pick(obj, LINK_KEYS),
      instructions: pick(obj, INSTRUCTION_KEYS),
    };
    if (r.code && looksLikeUrl(r.code) && !r.link) return { ...r, code: null, link: r.code };
    return r;
  }
  return empty;
}

export function hasRedeemable(r: Redemption): boolean {
  return r.code !== null || r.link !== null;
}

function maskValue(s: string): string {
  if (s.length <= 4) return "*".repeat(s.length);
  return `${s.slice(0, 2)}${"*".repeat(Math.min(s.length - 4, 12))}${s.slice(-2)} (${s.length} chars)`;
}

/** A form that is safe to print: shape and length only. */
export function maskRedemption(r: Redemption): Record<keyof Redemption, string | null> {
  let link: string | null = null;
  if (r.link) {
    try {
      link = `${new URL(r.link).origin}/… (${r.link.length} chars)`;
    } catch {
      link = maskValue(r.link);
    }
  }
  return {
    code: r.code ? maskValue(r.code) : null,
    pin: r.pin ? "*".repeat(Math.min(r.pin.length, 8)) : null,
    link,
    instructions: r.instructions ? `(${r.instructions.length} chars)` : null,
  };
}
