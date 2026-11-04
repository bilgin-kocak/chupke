// The eleven scenes, each on the absolute clock (seconds), each visible inside its window from timeline.json.
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import { BrowserFrame, C, Eyebrow, FONT, MONO, Mark, Pill, Terminal, WalletMemo } from "./components";
import { S, clamp01, easeInOut, easeOut, pop, ramp, windowed } from "./time";

const Win: React.FC<{ t: number; name: string; fade?: number; children: React.ReactNode }> = ({ t, name, fade = 0.35, children }) => {
  const [a, b] = S[name]!;
  if (t < a - 0.05 || t > b + 0.05) return null;
  return <AbsoluteFill style={{ opacity: windowed(t, a, b, fade) }}>{children}</AbsoluteFill>;
};

const Row: React.FC<{ t: number; at: number; x: number; y: number; w?: number; title: string; sub?: string; tone?: string }> = ({ t, at, x, y, w = 470, title, sub, tone = C.mint }) => {
  const s = pop(t, at, 0.5);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, opacity: clamp01(s * 1.5), transform: `translateX(${(1 - s) * 40}px)` }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 14, height: 14, borderRadius: 99, background: tone, marginTop: 13, boxShadow: `0 0 0 6px ${tone}22`, flex: "none" }} />
        <div>
          <div style={{ color: C.white, fontFamily: FONT, fontWeight: 720, fontSize: 34, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{title}</div>
          {sub && <div style={{ color: C.mute, fontFamily: FONT, fontSize: 22, marginTop: 6, lineHeight: 1.35 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};

// ---- 1. Hook: a checkout that keeps everything ---------------------------------------------
const FIELDS: Array<[label: string, value: string, typeAt: number, stampAt: number]> = [
  ["Email", "you@example.com", 0.9, 5.6],
  ["Card number", "4242 4242 4242 4242", 2.1, 6.15],
  ["Name on card", "Your Name", 3.3, 6.7],
  ["Phone", "+91 98•• ••• •••", 4.3, 7.25],
];
export const STAMPS = FIELDS.map((f) => f[3]);
export const TYPES = FIELDS.map((f) => f[2]);

export const Hook: React.FC<{ t: number }> = ({ t }) => {
  const out = easeInOut(ramp(t, 8.6, 9.4));
  return (
    <Win t={t} name="hook" fade={0.2}>
      <div style={{ position: "absolute", left: 60, top: 50 }}><Pill>Illustration</Pill></div>
      <div style={{ position: "absolute", left: 640, top: 120, width: 640, transform: `scale(${1 - out * 0.12})`, filter: `blur(${out * 10}px)`, opacity: 1 - out }}>
        <div style={{ background: C.white, borderRadius: 28, padding: "34px 40px 30px", boxShadow: "0 60px 140px -40px rgba(0,0,0,.9)", fontFamily: FONT }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 38, fontWeight: 780, color: "#111", letterSpacing: "-0.03em" }}>Checkout</div>
            <div style={{ fontSize: 22, color: "#667", fontWeight: 600 }}>Gift card · $25</div>
          </div>
          {FIELDS.map(([label, value, typeAt, stampAt], i) => {
            const n = Math.floor(value.length * clamp01((t - typeAt) / 0.7));
            const st = pop(t, stampAt, 0.32);
            return (
              <div key={label} style={{ position: "relative", marginTop: i === 0 ? 26 : 18 }}>
                <div style={{ fontSize: 19, color: "#556", fontWeight: 650, marginBottom: 7 }}>{label}</div>
                <div style={{ height: 58, borderRadius: 13, border: "1.5px solid #d8dde3", background: "#f7f8fa", display: "flex", alignItems: "center", padding: "0 18px", fontSize: 25, color: "#111", fontFamily: label === "Card number" ? MONO : FONT }}>
                  {value.slice(0, n)}
                  {t > typeAt && n < value.length && <span style={{ width: 2, height: 28, background: "#111", marginLeft: 2 }} />}
                </div>
                {st > 0 && (
                  <div style={{ position: "absolute", right: 14, top: 26, transform: `rotate(-9deg) scale(${2.2 - 1.2 * Math.min(1, st)})`, opacity: clamp01(st * 2), border: `4px solid ${C.red}`, color: C.red, borderRadius: 10, padding: "4px 14px", fontWeight: 850, fontSize: 26, letterSpacing: "0.12em", background: "rgba(255,255,255,.85)" }}>
                    STORED
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 26, height: 62, borderRadius: 999, background: "#111", color: "#fff", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 700 }}>Pay $25</div>
        </div>
      </div>
    </Win>
  );
};

// ---- 2. Title ---------------------------------------------------------------------------------
export const Title: React.FC<{ t: number }> = ({ t }) => {
  const [a] = S.title!;
  const m = pop(t, a + 0.05, 0.6);
  const w = easeOut(ramp(t, a + 0.25, a + 0.85));
  const hindi = easeOut(ramp(t, 11.7, 12.2));
  const tag = easeOut(ramp(t, 12.7, 13.3));
  const flash = 1 - ramp(t, a, a + 0.5);
  return (
    <Win t={t} name="title" fade={0.25}>
      <AbsoluteFill style={{ background: `rgba(128,230,193,${0.22 * flash})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 44 }}>
        <div style={{ transform: `scale(${m})` }}><Mark size={190} /></div>
        <div style={{ opacity: w, transform: `translateX(${(1 - w) * -30}px)`, color: C.white, fontFamily: FONT, fontWeight: 820, fontSize: 190, letterSpacing: "-0.06em", lineHeight: 1 }}>chupke</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", opacity: hindi, color: C.goldHi, fontFamily: "FreeSans, Inter, sans-serif", fontSize: 64, fontWeight: 600 }}>
        चुपके <span style={{ fontFamily: FONT, color: C.mute, fontSize: 44, fontWeight: 500 }}>· “quietly”</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 650, textAlign: "center", opacity: tag, transform: `translateY(${(1 - tag) * 16}px)`, fontFamily: FONT, fontWeight: 760, fontSize: 58, letterSpacing: "-0.03em" }}>
        <span style={{ background: "linear-gradient(92deg,#80e6c1 10%,#ecc66e 90%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Gift cards, bought quietly.</span>
      </div>
    </Win>
  );
};

// ---- 3. Pitch: the live landing page -----------------------------------------------------------
export const Pitch: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.pitch!;
  return (
    <Win t={t} name="pitch">
      <BrowserFrame src="capture/landing.webm" from={a} startFrom={0} x={70} y={92} w={1240} scale={1 + 0.03 * ramp(t, a, b)} badges={<Pill tone="live" style={{ fontSize: 16, padding: "4px 12px" }}>LIVE</Pill>} />
      <Eyebrow t={t} at={a + 0.2} x={1370} y={140}>The idea</Eyebrow>
      <Row t={t} at={15.2} x={1370} y={196} title="Pay in shielded ZEC" sub="From any Zcash wallet" />
      <Row t={t} at={17.1} x={1370} y={346} title="An agent buys it" sub="On Bitrefill, from the shop's own balance" />
      <Row t={t} at={19.8} x={1370} y={496} title="Code by encrypted memo" sub="Straight to your own wallet" />
      <Row t={t} at={23.9} x={1370} y={646} title="No account. No email." tone={C.gold} />
    </Win>
  );
};

// ---- 4. Shop: pick, paste, get the QR (live) ------------------------------------------------
const LiveBadges = ({ speed }: { speed?: string }) => (
  <div style={{ display: "flex", gap: 10 }}>
    {speed && <Pill tone="gold" style={{ fontSize: 16, padding: "4px 12px" }}>{speed}</Pill>}
    <Pill tone="live" style={{ fontSize: 16, padding: "4px 12px" }}>LIVE · Zcash testnet</Pill>
  </div>
);

export const Shop: React.FC<{ t: number }> = ({ t }) => (
  <Win t={t} name="shop">
    <BrowserFrame src="capture/order-ok.webm" from={S.shop![0]} startFrom={0.3} rate={1.15} x={70} y={92} w={1240} badges={<LiveBadges />} />
    <Eyebrow t={t} at={27.0} x={1370} y={140}>A real order, right now</Eyebrow>
    <Row t={t} at={27.3} x={1370} y={196} title="Pick a card" sub="Test gift card, $10 face value" />
    <Row t={t} at={29.0} x={1370} y={346} title="Paste a fresh address" sub="Where the code, or a refund, will go" />
    <Row t={t} at={30.9} x={1370} y={496} title="Get the payment QR" sub="ZIP 321: amount, address and memo" />
    <div style={{ position: "absolute", left: 1370, top: 690, width: 470, opacity: ramp(t, 31.5, 32), color: C.faint, fontFamily: FONT, fontSize: 19, lineHeight: 1.4 }}>
      The address, QR and memo are blurred here: they hold wallet addresses.
    </div>
  </Win>
);

// ---- 5. Pay: the shielded payment from the buyer wallet -----------------------------------
export const Pay: React.FC<{ t: number }> = ({ t }) => (
  <Win t={t} name="pay">
    <BrowserFrame src="capture/order-ok.webm" from={S.pay![0]} startFrom={9.0} x={70} y={92} w={1240} badges={<LiveBadges />} />
    <Terminal
      t={t}
      at={33.35}
      x={1010}
      y={470}
      w={860}
      label="The real run, re-typeset"
      lines={[
        { text: "$ npm run buyer:pay -- --order MBZ6TXKA3Y", at: 33.6 },
        { text: "order MBZ6TXKA3Y: pay 1000000 zat to utest1…", at: 34.4, color: C.mute },
        { text: "sent in 7155 ms · txid 130c2799…7efa", at: 35.3, color: C.mint },
      ]}
    />
  </Win>
);

// ---- 6. Watch: the order page moves on its own (sped up) ----------------------------------
export const Watch: React.FC<{ t: number }> = ({ t }) => (
  <Win t={t} name="watch">
    <BrowserFrame src="capture/order-ok.webm" from={S.watch![0]} startFrom={56.0} rate={4} x={70} y={92} w={1240} badges={<LiveBadges speed="4× speed" />} />
    <Eyebrow t={t} at={37.3} x={1370} y={140}>The agent, on its own</Eyebrow>
    <Row t={t} at={37.7} x={1370} y={196} title="Payment seen" sub="In the mempool, shielded" />
    <Row t={t} at={38.4} x={1370} y={316} title="Confirmed" sub="One block" />
    <Row t={t} at={39.2} x={1370} y={436} title="Caps and allowlist" sub="$10 per order, $30 a day" tone={C.gold} />
    <Row t={t} at={41.4} x={1370} y={556} title="Bought on Bitrefill" sub="REST v2, the shop's own balance" />
    <Row t={t} at={42.8} x={1370} y={676} title="Code sent" sub="As a shielded memo" />
  </Win>
);

// ---- 7. Wallet: the code arrives ------------------------------------------------------------
export const Wallet: React.FC<{ t: number }> = ({ t }) => (
  <Win t={t} name="wallet">
    <BrowserFrame src="capture/order-ok.webm" from={S.wallet![0]} startFrom={84.0} x={70} y={92} w={1240} dim={0.45} badges={<LiveBadges />} />
    <WalletMemo
      t={t}
      at={44.4}
      x={1000}
      y={280}
      w={830}
      title="shielded memo · just now"
      lines={["Chupke #MBZ6TXKA3Y delivered", "Test gift card", "Code: 39••••••••••••74"]}
      foot="Only your wallet can read this · code masked here"
    />
    <div style={{ position: "absolute", left: 1000, top: 650, opacity: ramp(t, 45.6, 46.1) }}>
      <Pill style={{ background: "rgba(3,9,7,.85)", fontSize: 21 }}>Payment to code: about a minute · delivery tx e6570b46…</Pill>
    </div>
  </Win>
);

// ---- 8. Safety: careful with money ------------------------------------------------------------
const Card: React.FC<{ t: number; at: number; x: number; y: number; head: string; outcome: string; tag: string; tone?: string; children?: React.ReactNode }> = ({ t, at, x, y, head, outcome, tag, tone = C.amber, children }) => {
  const s = pop(t, at, 0.5);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 830, height: 310, opacity: clamp01(s * 1.6), transform: `translateY(${(1 - s) * 30}px) scale(${0.95 + 0.05 * s})`, borderRadius: 26, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", padding: "26px 30px", fontFamily: FONT, boxShadow: "0 30px 80px -40px rgba(0,0,0,.8)" }}>
      <div style={{ color: C.mute, fontSize: 24, fontWeight: 600 }}>{head}</div>
      <div style={{ color: tone, fontSize: 44, fontWeight: 780, letterSpacing: "-0.03em", marginTop: 6 }}>{outcome}</div>
      <div style={{ marginTop: 14 }}>{children}</div>
      <div style={{ position: "absolute", left: 30, bottom: 22, color: C.faint, fontSize: 18, fontFamily: MONO }}>{tag}</div>
    </div>
  );
};

export const Safety: React.FC<{ t: number }> = ({ t }) => (
  <Win t={t} name="safety">
    <Eyebrow t={t} at={50.3} x={100} y={92}>Careful with money</Eyebrow>
    <div style={{ position: "absolute", left: 100, top: 130, opacity: easeOut(ramp(t, 50.4, 50.9)), color: C.white, fontFamily: FONT, fontWeight: 780, fontSize: 56, letterSpacing: "-0.035em" }}>
      Every failure gives the money back.
    </div>
    <Card t={t} at={52.0} x={100} y={240} head="The card failed" outcome="Refunded, with the reason" tag="live today · order WHD2NBHECQ">
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ fontFamily: MONO, fontSize: 18, color: C.ink, lineHeight: 1.5, background: "rgba(0,0,0,.25)", borderRadius: 12, padding: "10px 14px", width: 430 }}>
          refund: The gift card provider could not deliver · 0.01 TAZ returned. The purchase failed; nothing was bought.
        </div>
        <div style={{ width: 300, height: 120, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.14)" }}>
          <Sequence from={Math.round(52.0 * 30)} layout="none">
            <OffthreadVideo src={staticFile("capture/order-fail.webm")} startFrom={Math.round(86.5 * 30)} muted style={{ width: 300, height: 169, marginTop: -6 }} />
          </Sequence>
        </div>
      </div>
    </Card>
    <Card t={t} at={55.2} x={990} y={240} head="Over the $10 per-order cap" outcome="Refused and refunded" tag="testnet · order N3RVZ44M5G">
      <div style={{ fontFamily: MONO, fontSize: 18, color: C.ink, lineHeight: 1.5, background: "rgba(0,0,0,.25)", borderRadius: 12, padding: "10px 14px" }}>
        refund: Over the per-order limit · 0.02 TAZ returned. No purchase was made.
      </div>
    </Card>
    <Card t={t} at={57.4} x={100} y={580} head="Paid twice" outcome="Second payment refunded" tag="testnet · order YMXHFE23J6">
      <div style={{ color: C.mute, fontSize: 22 }}>Each received payment is processed exactly once.</div>
    </Card>
    <Card t={t} at={60.5} x={990} y={580} head="Agent killed mid-delivery (kill -9)" outcome="Exactly one code" tone={C.mint} tag="testnet · order Q5S258G7D0">
      <div style={{ color: C.mute, fontSize: 22 }}>One Bitrefill invoice, one delivery memo, after a restart.</div>
    </Card>
  </Win>
);

// ---- 9. Privacy: who sees what ------------------------------------------------------------------
export const Privacy: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.privacy!;
  return (
    <Win t={t} name="privacy">
      <BrowserFrame src="capture/landing.webm" from={a} startFrom={12.0} rate={0.45} x={70} y={92} w={1240} scale={1 + 0.025 * ramp(t, a, b)} badges={<LiveBadges />} />
      <Eyebrow t={t} at={a + 0.2} x={1370} y={140}>Who sees what</Eyebrow>
      <Row t={t} at={66.9} x={1370} y={196} title="Bitrefill" sub="Never learns who you are" />
      <Row t={t} at={69.1} x={1370} y={336} title="The chain" sub="Encrypted data only" />
      <Row t={t} at={71.4} x={1370} y={476} title="Codes" sub="Never stored, anywhere" />
      <Row t={t} at={73.8} x={1370} y={616} title="Your reply address" sub="Deleted an hour after delivery" tone={C.gold} />
    </Win>
  );
};

// ---- 10. Under the hood ----------------------------------------------------------------------------
const Node: React.FC<{ t: number; at: number; x: number; title: string; lines: string[]; dark?: boolean }> = ({ t, at, x, title, lines, dark }) => {
  const s = pop(t, at, 0.5);
  return (
    <div style={{ position: "absolute", left: x, top: 250, width: 470, height: 330, opacity: clamp01(s * 1.5), transform: `translateY(${(1 - s) * 30}px)`, borderRadius: 26, padding: "30px 32px", fontFamily: FONT, background: dark ? "#0a1612" : "rgba(255,255,255,.06)", border: `1.5px solid ${dark ? C.mint : "rgba(255,255,255,.14)"}`, boxShadow: dark ? "0 0 0 8px rgba(128,230,193,.08), 0 40px 90px -40px rgba(0,0,0,.9)" : "0 30px 80px -40px rgba(0,0,0,.8)" }}>
      <div style={{ color: dark ? C.mint : C.white, fontSize: 38, fontWeight: 780, letterSpacing: "-0.03em" }}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: C.mute, fontSize: 24, marginTop: i === 0 ? 18 : 10, lineHeight: 1.35 }}>{l}</div>
      ))}
    </div>
  );
};

const Link: React.FC<{ t: number; at: number; x: number }> = ({ t, at, x }) => {
  const p = easeOut(ramp(t, at, at + 0.5));
  return (
    <svg width={140} height={40} style={{ position: "absolute", left: x, top: 395 }}>
      <line x1={10} y1={20} x2={10 + 110 * p} y2={20} stroke={C.mint} strokeWidth={4} strokeLinecap="round" strokeDasharray="10 9" />
      {p > 0.95 && <path d="M112 10 L128 20 L112 30" fill="none" stroke={C.mint} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
};

export const Hood: React.FC<{ t: number }> = ({ t }) => {
  const chips = ["ZIP 321 payment requests", "ZIP 316 diversified addresses", "view-only inbox (UFVK)", "Bitrefill REST v2 + MCP", "exactly-once state machine", "97 tests", "Docker · Railway"];
  return (
    <Win t={t} name="hood">
      <Eyebrow t={t} at={77.6} x={130} y={110}>Under the hood</Eyebrow>
      <div style={{ position: "absolute", left: 130, top: 150, opacity: easeOut(ramp(t, 77.7, 78.2)), color: C.white, fontFamily: FONT, fontWeight: 780, fontSize: 52, letterSpacing: "-0.035em" }}>
        Two processes. Only one holds keys.
      </div>
      <Node t={t} at={78.0} x={130} title="Web · public" lines={["Order pages, QR, live status", "No wallet, no viewing key", "No Bitrefill key"]} />
      <Link t={t} at={78.6} x={615} />
      <Node t={t} at={78.9} x={735} title="SQLite" lines={["Every payment inserted once", "State saved before money moves"]} />
      <Link t={t} at={79.5} x={1220} />
      <Node t={t} at={79.8} x={1340} dark title="Worker · private" lines={["View-only inbox watches", "Shop wallet sends memos", "Buys on Bitrefill"]} />
      <div style={{ position: "absolute", left: 130, right: 130, top: 640, display: "flex", flexWrap: "wrap", gap: 14 }}>
        {chips.map((c, i) => {
          const s = easeOut(ramp(t, 80.6 + i * 0.18, 80.9 + i * 0.18));
          return (
            <div key={c} style={{ opacity: s, transform: `translateY(${(1 - s) * 12}px)`, fontFamily: MONO, fontSize: 22, color: C.ink, padding: "10px 16px", borderRadius: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}>{c}</div>
          );
        })}
      </div>
    </Win>
  );
};

// ---- 11. Close ---------------------------------------------------------------------------------------
export const Close: React.FC<{ t: number }> = ({ t }) => {
  const [a] = S.close!;
  const m = pop(t, a + 0.3, 0.6);
  const tag = easeOut(ramp(t, 85.9, 86.6));
  const links = easeOut(ramp(t, 86.9, 87.6));
  return (
    <Win t={t} name="close" fade={0.4}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, display: "flex", justifyContent: "center", alignItems: "center", gap: 34 }}>
        <div style={{ transform: `scale(${m})` }}><Mark size={150} /></div>
        <div style={{ opacity: clamp01(m), color: C.white, fontFamily: FONT, fontWeight: 820, fontSize: 150, letterSpacing: "-0.06em", lineHeight: 1 }}>chupke</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 430, textAlign: "center", opacity: tag, fontFamily: FONT, fontWeight: 760, fontSize: 66, letterSpacing: "-0.035em" }}>
        <span style={{ background: "linear-gradient(92deg,#80e6c1 10%,#ecc66e 90%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Gift cards, bought quietly.</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 570, display: "flex", justifyContent: "center", gap: 18, opacity: links }}>
        <Pill tone="live" style={{ fontSize: 26, padding: "12px 22px" }}>chupke-production.up.railway.app</Pill>
        <Pill style={{ fontSize: 26, padding: "12px 22px" }}>github.com/bilgin-kocak/chupke</Pill>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, textAlign: "center", opacity: links, color: C.mute, fontFamily: FONT, fontSize: 26 }}>
        Built in a day at Free Society Hack, Mumbai · Zcash testnet · Bitrefill
      </div>
    </Win>
  );
};
