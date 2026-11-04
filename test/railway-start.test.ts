import { describe, expect, it } from "vitest";
import { webEnv } from "../scripts/railway-start.js";
import { WebEnv, WorkerEnv } from "../src/config.js";

describe("railway-start webEnv", () => {
  it("passes no worker-only variable to the web", () => {
    const workerOnly = Object.keys(WorkerEnv.shape).filter((k) => !(k in WebEnv.shape));
    expect(workerOnly).toEqual(expect.arrayContaining(["BITREFILL_API_KEY", "ZINGO_SEED", "SHOP_UFVK", "WALLET_BIRTHDAY"]));
    const env = Object.fromEntries(workerOnly.map((k) => [k, "secret"]));
    const out = webEnv({ ...env, RAILWAY_VOLUME_MOUNT_PATH: "/data", PATH: "/usr/bin" }, "/data/db/chupke.db");
    for (const k of workerOnly) expect(out).not.toHaveProperty(k);
    expect(out).not.toHaveProperty("RAILWAY_VOLUME_MOUNT_PATH");
    expect(Object.values(out)).not.toContain("secret");
  });

  it("passes the web's own settings and points it at the shared database", () => {
    const out = webEnv(
      { PATH: "/usr/bin", PORT: "8080", PUBLIC_BASE_URL: "https://x.up.railway.app", DASHBOARD_PASSWORD: "pw", DATABASE_PATH: "/app/db/chupke.db" },
      "/data/db/chupke.db",
    );
    expect(out).toMatchObject({ PATH: "/usr/bin", PORT: "8080", PUBLIC_BASE_URL: "https://x.up.railway.app", DASHBOARD_PASSWORD: "pw" });
    expect(out.DATABASE_PATH).toBe("/data/db/chupke.db");
  });
});
