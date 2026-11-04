import { describe, expect, it } from "vitest";
import { isOrderId, newOrderId } from "../src/ids.js";
import { MAX_REPLY_UA_LEN, bech32mChecksumOk, replyAddressProblem } from "../src/zcash/address.js";
import { fakeUa } from "./helpers.js";

describe("reply address validation", () => {
  it("accepts a well-formed Bech32m utest1 address", () => {
    const ua = fakeUa();
    expect(bech32mChecksumOk(ua)).toBe(true);
    expect(replyAddressProblem(ua)).toBeNull();
  });

  it("rejects a single-character typo via the checksum", () => {
    const ua = fakeUa();
    const i = 40;
    const typo = ua.slice(0, i) + (ua[i] === "q" ? "p" : "q") + ua.slice(i + 1);
    expect(replyAddressProblem(typo)).toBe("checksum");
  });

  it("rejects other networks, transparent addresses, bad charset and oversize", () => {
    expect(replyAddressProblem("")).toBe("empty");
    expect(replyAddressProblem(fakeUa(100, "u"))).toBe("not_testnet_unified");
    expect(replyAddressProblem("tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd")).toBe("not_testnet_unified");
    expect(replyAddressProblem("utest1ABCDEFGHIJ" + "q".repeat(80))).toBe("charset");
    expect(replyAddressProblem("utest1" + "q".repeat(20))).toBe("too_short");
    expect(replyAddressProblem(fakeUa(MAX_REPLY_UA_LEN))).toBe("too_long");
  });
});

describe("order ids", () => {
  it("are 10-char Crockford base32", () => {
    for (let i = 0; i < 200; i++) expect(isOrderId(newOrderId())).toBe(true);
    expect(isOrderId("ABCDEFGHIL")).toBe(false); // I and L are not Crockford
  });
});
