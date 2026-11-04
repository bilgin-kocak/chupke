export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window limiter: at most `limit` acquisitions in any `windowMs` span.
 * Acquisitions are serialized, so concurrent callers queue in order.
 */
export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: Clock = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {
    if (limit < 1) throw new Error("limit must be >= 1");
  }

  /** How long the next acquire would wait right now (0 = immediate). */
  waitMs(): number {
    const t = this.now();
    while (this.stamps.length > 0 && t - this.stamps[0]! >= this.windowMs) this.stamps.shift();
    if (this.stamps.length < this.limit) return 0;
    return this.stamps[0]! + this.windowMs - t;
  }

  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      for (;;) {
        const wait = this.waitMs();
        if (wait <= 0) break;
        await this.sleep(wait);
      }
      this.stamps.push(this.now());
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Minimum spacing between calls (e.g. /ping allows 1 request per 3 s). */
export class MinIntervalLimiter {
  private last = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly intervalMs: number,
    private readonly now: Clock = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {}

  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      const wait = this.last + this.intervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Several limiters that must all admit a request. */
export class CompositeLimiter {
  constructor(private readonly parts: Array<{ acquire(): Promise<void> }>) {}
  async acquire(): Promise<void> {
    for (const p of this.parts) await p.acquire();
  }
}

/** Backoff after a 429 without Retry-After, or a transient failure: 5/10/20/60 s plus jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const steps = [5_000, 10_000, 20_000, 60_000];
  const base = steps[Math.min(Math.max(attempt, 0), steps.length - 1)]!;
  return base + Math.floor(random() * 1_000);
}

/** Parse an HTTP Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now: Clock = Date.now): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now());
}
