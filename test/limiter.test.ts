import { describe, expect, it } from "vitest";
import { MinIntervalLimiter, SlidingWindowLimiter, backoffMs, parseRetryAfter } from "../src/bitrefill/limiter.js";

function fakeTime() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe("SlidingWindowLimiter", () => {
  it("admits up to the limit immediately, then waits for the oldest stamp to leave the window", async () => {
    const ft = fakeTime();
    const lim = new SlidingWindowLimiter(2, 10_000, ft.now, ft.sleep);
    await lim.acquire();
    ft.advance(1_000);
    await lim.acquire();
    expect(ft.sleeps).toEqual([]);
    await lim.acquire(); // third within the window: must wait until t0 + 10 s
    expect(ft.sleeps).toEqual([9_000]);
  });

  it("never exceeds the limit inside any window", async () => {
    const ft = fakeTime();
    const lim = new SlidingWindowLimiter(55, 600_000, ft.now, ft.sleep);
    const stamps: number[] = [];
    for (let i = 0; i < 120; i++) {
      await lim.acquire();
      stamps.push(ft.now());
      ft.advance(1_000);
    }
    for (const s of stamps) {
      const inWindow = stamps.filter((x) => x >= s && x < s + 600_000).length;
      expect(inWindow).toBeLessThanOrEqual(55);
    }
  });
});

describe("MinIntervalLimiter", () => {
  it("spaces calls by the interval", async () => {
    const ft = fakeTime();
    const lim = new MinIntervalLimiter(3_000, ft.now, ft.sleep);
    await lim.acquire();
    await lim.acquire();
    expect(ft.sleeps).toEqual([3_000]);
  });
});

describe("backoff and Retry-After", () => {
  it("backs off 5/10/20/60 s plus under 1 s of jitter", () => {
    expect([0, 1, 2, 3, 9].map((a) => backoffMs(a, () => 0))).toEqual([5_000, 10_000, 20_000, 60_000, 60_000]);
    expect(backoffMs(0, () => 0.999)).toBeLessThan(6_000);
  });

  it("parses seconds and HTTP dates", () => {
    expect(parseRetryAfter("7")).toBe(7_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("garbage")).toBeNull();
    const now = Date.parse("2026-11-04T07:00:00Z");
    expect(parseRetryAfter("Wed, 04 Nov 2026 07:00:30 GMT", () => now)).toBe(30_000);
  });
});
