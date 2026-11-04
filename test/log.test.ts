import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, scrub } from "../src/log.js";

const UA = "utest1l6w362zgp6hwkv5vgua4x2xra8wdvqmpqu83pe886stjxhme0958226zu8cetm6uvzq64za0q0dqhz3k4d03sgqfxlaut2rq5uvt9vsa";

function spy() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString("utf8"));
      cb();
    },
  });
  return { logger: createLogger({ level: "debug", destination: stream }), lines };
}

describe("log redaction", () => {
  it("redacts secret fields by name", () => {
    const { logger, lines } = spy();
    logger.info(
      { memo: `CHUPKE1 o=ABCDEFGHJK r=${UA}`, replyUa: UA, code: "GIFT-1234", pin: "9999", apiKey: "sk_live", nested: { seed: "abandon abandon" } },
      "payment seen",
    );
    const out = lines.join("");
    for (const secret of ["CHUPKE1", UA, "GIFT-1234", "9999", "sk_live", "abandon"]) expect(out).not.toContain(secret);
    expect(out).toContain("payment seen");
  });

  it("scrubs addresses inside free text and messages", () => {
    const { logger, lines } = spy();
    logger.warn({ detail: `send to ${UA} failed` }, `could not reach ${UA}`);
    expect(lines.join("")).not.toContain(UA);
    expect(scrub(`x ${UA} y`)).toBe("x [redacted] y");
  });
});
