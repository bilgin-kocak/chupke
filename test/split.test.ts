import { describe, expect, it } from "vitest";
import { SplitWallet, type ZcashWallet } from "../src/zcash/wallet.js";

function recorder(name: string, calls: string[]): ZcashWallet {
  const rec = <T>(m: string, v: T) => async () => {
    calls.push(`${name}.${m}`);
    return v;
  };
  return {
    info: rec("info", { chainHeight: 1, walletHeight: 1 }),
    sync: rec("sync", undefined),
    primaryAddress: rec("primaryAddress", `${name}-ua`),
    balance: rec("balance", { spendableZat: 1, totalZat: 1 }),
    listIncoming: rec("listIncoming", []),
    listSent: rec("listSent", []),
    send: async () => {
      calls.push(`${name}.send`);
      return { txid: "t" };
    },
  };
}

describe("SplitWallet", () => {
  it("watches with the inbox and spends with the outbox", async () => {
    const calls: string[] = [];
    const w = new SplitWallet(recorder("inbox", calls), recorder("outbox", calls));
    await w.sync();
    await w.listIncoming();
    await w.info();
    await w.primaryAddress();
    await w.balance();
    await w.listSent();
    await w.send("x", 1, "m");
    expect(calls).toEqual([
      "inbox.sync",
      "outbox.sync",
      "inbox.listIncoming",
      "inbox.info",
      "inbox.primaryAddress",
      "outbox.balance",
      "outbox.listSent",
      "outbox.send",
    ]);
  });
});
