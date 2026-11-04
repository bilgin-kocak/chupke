import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadWebConfig, loadWorkerConfig } from "../src/config.js";

/** Parse a .env-style file the way docker compose's env_file / `process.loadEnvFile` would. */
function parseEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

describe("config", () => {
  it("treats empty variables as unset (compose passes ${VAR:-} as an empty string)", () => {
    const web = loadWebConfig({ PUBLIC_BASE_URL: "", PORT: "", DASHBOARD_PASSWORD: "", SHOP_UA: "", DAILY_CAP_INCLUDES_TEST: "" });
    expect(web.PUBLIC_BASE_URL).toBe("http://localhost:8080");
    expect(web.PORT).toBe(8080);
    expect(web.DASHBOARD_PASSWORD).toBeUndefined();
    expect(web.DAILY_CAP_INCLUDES_TEST).toBe(false);
  });

  it("accepts .env.example copied verbatim, for both processes", () => {
    const env = parseEnvFile(".env.example");
    const worker = loadWorkerConfig(env);
    expect(worker.ALLOW_REAL_PURCHASES).toBe(false);
    expect(worker.WALLET_BIRTHDAY).toBeUndefined();
    expect(worker.BITREFILL_API_KEY).toBeUndefined();
    expect(worker.LIGHTWALLETD_URL).toBe("https://testnet.zec.rocks:443");
    expect(loadWebConfig(env).PORT).toBe(8080);
  });

  it("still rejects invalid values", () => {
    expect(() => loadWorkerConfig({ ALLOW_REAL_PURCHASES: "yes" })).toThrow();
    expect(() => loadWorkerConfig({ WALLET_BIRTHDAY: "-5" })).toThrow();
  });
});
