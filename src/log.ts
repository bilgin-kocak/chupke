import { pino, type DestinationStream, type Logger, type LoggerOptions } from "pino";

/**
 * Field names that must never reach a log line (SPEC §2): the Bitrefill key, wallet seeds,
 * viewing keys, redemption codes/PINs/links, reply addresses and memo contents.
 * Matched at the top level and one or two levels deep.
 */
const SECRET_KEYS = [
  "apiKey",
  "api_key",
  "authorization",
  "Authorization",
  "seed",
  "mnemonic",
  "ufvk",
  "viewkey",
  "code",
  "pin",
  "link",
  "redemption",
  "redemption_info",
  "redemptionInfo",
  "memo",
  "memoText",
  "replyUa",
  "reply_ua",
  "to",
  "address",
  "ua",
] as const;

export const REDACT_PATHS: string[] = SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

/**
 * Defense in depth for free-form strings: unified/sapling addresses and viewing keys are
 * replaced wherever they appear, including inside messages and error texts.
 */
const KEY_OR_ADDRESS =
  /\b(?:utest|uviewtest|uivktest|uview|uivk|u|ztestsapling|zxviewtestsapling|zxviews|zs|secret-extended-key-test|secret-extended-key-main)1[02-9ac-hj-np-z]{20,}\b/gi;

export function scrub(text: string): string {
  return text.replace(KEY_OR_ADDRESS, "[redacted]");
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrub(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value instanceof Error) {
    return { type: value.name, message: scrub(value.message) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1);
  return out;
}

export function createLogger(opts: { level?: string; destination?: DestinationStream; name?: string } = {}): Logger {
  const options: LoggerOptions = {
    level: opts.level ?? process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    formatters: {
      log: (obj) => scrubDeep(obj) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        const cleaned = args.map((a) => (typeof a === "string" ? scrub(a) : a)) as typeof args;
        return method.apply(this, cleaned);
      },
    },
  };
  if (opts.name) options.name = opts.name;
  return opts.destination ? pino(options, opts.destination) : pino(options);
}

export const log: Logger = createLogger({ name: "chupke" });
