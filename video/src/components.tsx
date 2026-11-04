// Shared pieces in Chupke's own design language (DESIGN.md): night background, browser frame, badges, terminal,
// the wallet memo card, captions.
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, random, staticFile } from "remotion";
import { FPS, VO, clamp01, easeOut, pop, ramp } from "./time";

export const C = {
  night: "#06110d",
  night2: "#0b1c17",
  ink: "#e9f1ed",
  mute: "#9fb2aa",
  faint: "#5f7369",
  brand: "#0e5c4a",
  brandHi: "#2fa37f",
  mint: "#80e6c1",
  gold: "#e5ad3c",
  goldHi: "#ecc66e",
  red: "#e5484d",
  amber: "#f0a85a",
  white: "#ffffff",
  paper: "#f6f9f7",
};
export const FONT = "Inter, 'Inter Display', FreeSans, system-ui, sans-serif";
export const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";

export const Background: React.FC<{ t: number }> = ({ t }) => {
  const dots = Array.from({ length: 46 }, (_, i) => {
    const x = random(`x${i}`) * 1920;
    const speed = 5 + random(`s${i}`) * 10;
    const y = (((random(`y${i}`) * 1180 - t * speed) % 1180) + 1180) % 1180 - 50;
    const r = 0.8 + random(`r${i}`) * 1.8;
    return <circle key={i} cx={x + Math.sin(t * 0.3 + i) * 10} cy={y} r={r} fill={i % 7 === 0 ? C.gold : C.mint} opacity={0.06 + random(`o${i}`) * 0.14} />;
  });
  const drift = Math.sin(t * 0.15) * 40;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 640px at ${1450 + drift}px 260px, rgba(28,140,108,.45), transparent 70%),
            radial-gradient(700px 520px at ${260 - drift}px 80px, rgba(229,173,60,.16), transparent 70%),
            radial-gradient(1000px 600px at 860px 1180px, rgba(14,92,74,.5), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(70% 70% at 50% 40%, #000, transparent 80%)",
          WebkitMaskImage: "radial-gradient(70% 70% at 50% 40%, #000, transparent 80%)",
        }}
      />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>{dots}</svg>
    </AbsoluteFill>
  );
};

/** The Chupke mark: a closed eye on emerald with the gold coin dot. */
export const Mark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <rect width="32" height="32" rx="9" fill={C.brand} />
    <path d="M7.5 14.5c2.3 3.1 5.2 4.7 8.5 4.7s6.2-1.6 8.5-4.7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M10.6 20.2l-1.5 2.3M16 21.6v2.7M21.4 20.2l1.5 2.3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <circle cx="24.3" cy="8.2" r="2.7" fill={C.gold} />
  </svg>
);

export const Pill: React.FC<{ children: React.ReactNode; tone?: "live" | "mute" | "gold" | "red" | "amber"; style?: React.CSSProperties }> = ({ children, tone = "mute", style }) => {
  const tones = {
    live: { bg: "rgba(53,211,154,.14)", fg: C.mint, br: "rgba(53,211,154,.35)" },
    mute: { bg: "rgba(255,255,255,.07)", fg: C.ink, br: "rgba(255,255,255,.16)" },
    gold: { bg: "rgba(229,173,60,.14)", fg: C.goldHi, br: "rgba(229,173,60,.4)" },
    red: { bg: "rgba(229,72,77,.15)", fg: "#ff8a8d", br: "rgba(229,72,77,.4)" },
    amber: { bg: "rgba(240,168,90,.15)", fg: C.amber, br: "rgba(240,168,90,.4)" },
  }[tone];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, background: tones.bg, color: tones.fg, border: `1px solid ${tones.br}`, fontFamily: FONT, fontWeight: 650, fontSize: 22, whiteSpace: "nowrap", ...style }}>
      {tone === "live" && <span style={{ width: 10, height: 10, borderRadius: 99, background: "#35d39a", boxShadow: "0 0 0 5px rgba(53,211,154,.2)" }} />}
      {children}
    </div>
  );
};

/** A browser window around a screen capture of the live site. */
export const BrowserFrame: React.FC<{
  src: string; from: number; startFrom: number; rate?: number; x: number; y: number; w: number; opacity?: number; scale?: number; dim?: number;
  badges?: React.ReactNode;
}> = ({ src, from, startFrom, rate = 1, x, y, w, opacity = 1, scale = 1, dim = 0, badges }) => {
  const h = (w * 9) / 16;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, opacity, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
      <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 50px 120px -40px rgba(0,0,0,.85), 0 18px 40px -20px rgba(0,0,0,.6)", background: "#0f1a16" }}>
        <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", background: "#14211c", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c, opacity: 0.85 }} />)}
          <div style={{ marginLeft: 18, flex: 1, maxWidth: 560, height: 30, borderRadius: 999, background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", color: C.mute, fontFamily: FONT, fontSize: 16 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth="2.4"><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
            chupke-production.up.railway.app
          </div>
          <div style={{ flex: 1 }} />
          {badges}
        </div>
        <div style={{ width: w, height: h, position: "relative", overflow: "hidden" }}>
          {/* The capture starts with its scene (from), at startFrom seconds into the recording. */}
          <Sequence from={Math.round(from * FPS)} layout="none">
            <OffthreadVideo src={staticFile(src)} startFrom={Math.round(startFrom * FPS)} playbackRate={rate} muted style={{ width: w, height: h }} />
          </Sequence>
          {dim > 0 && <AbsoluteFill style={{ background: `rgba(6,17,13,${dim})` }} />}
        </div>
      </div>
    </div>
  );
};

/** A terminal panel whose lines appear one by one. */
export const Terminal: React.FC<{ t: number; at: number; lines: { text: string; at: number; color?: string }[]; x: number; y: number; w: number; label?: string }> = ({ t, at, lines, x, y, w, label }) => {
  const s = pop(t, at, 0.5);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `translateY(${(1 - s) * 40}px)`, opacity: clamp01(s) }}>
      <div style={{ borderRadius: 16, background: "rgba(7,14,11,.96)", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 40px 90px -30px rgba(0,0,0,.9)", overflow: "hidden" }}>
        <div style={{ height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,.08)", color: C.faint, fontFamily: FONT, fontSize: 15 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: 0.7 }} />)}
          <span style={{ marginLeft: 8 }}>buyer wallet · zingo-cli</span>
        </div>
        <div style={{ padding: "16px 20px 18px", fontFamily: MONO, fontSize: 21, lineHeight: 1.65, color: C.ink }}>
          {lines.map((l, i) => {
            const shown = clamp01((t - l.at) / 0.45);
            const n = Math.floor(l.text.length * shown);
            return (
              <div key={i} style={{ color: l.color ?? C.ink, opacity: shown > 0 ? 1 : 0, whiteSpace: "pre" }}>
                {l.text.slice(0, n)}
                {shown > 0 && shown < 1 && <span style={{ background: C.mint, color: C.mint }}>_</span>}
              </div>
            );
          })}
        </div>
      </div>
      {label && <div style={{ marginTop: 10, color: C.faint, fontFamily: FONT, fontSize: 16 }}>{label}</div>}
    </div>
  );
};

/** The delivery as the buyer's wallet shows it: a shielded memo (code masked for the video). */
export const WalletMemo: React.FC<{ t: number; at: number; x: number; y: number; w: number; lines: string[]; title: string; foot: string; tone?: "ok" | "amber" }> = ({ t, at, x, y, w, lines, title, foot, tone = "ok" }) => {
  const s = pop(t, at, 0.55);
  const accent = tone === "ok" ? C.mint : C.amber;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `translateY(${(1 - s) * 60}px) scale(${0.92 + 0.08 * s})`, opacity: clamp01(s * 1.4), transformOrigin: "50% 100%" }}>
      <div style={{ borderRadius: 26, background: "rgba(12,27,22,.96)", border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 60px 120px -40px rgba(0,0,0,.95)", padding: "22px 26px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.mute, fontFamily: FONT, fontSize: 19, marginBottom: 14 }}>
          <Mark size={30} />
          <b style={{ color: C.white, fontSize: 21 }}>Chupke</b>
          <span>· {title}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 24, lineHeight: 1.6, color: C.ink, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "16px 20px", whiteSpace: "pre-line" }}>
          {lines.join("\n")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: accent, fontFamily: FONT, fontSize: 18, fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2"><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
          {foot}
        </div>
      </div>
    </div>
  );
};

/** Captions: the current chunk of the current voice line, at the bottom. */
export const Captions: React.FC<{ t: number; hidden?: string[] }> = ({ t, hidden = [] }) => {
  for (const [name, vo] of Object.entries(VO)) {
    if (hidden.includes(name)) continue;
    for (const c of vo.captions) {
      if (t >= c.start - 0.05 && t <= c.end + 0.25) {
        const o = Math.min(ramp(t, c.start - 0.05, c.start + 0.12), 1 - ramp(t, c.end + 0.1, c.end + 0.25));
        return (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 46, display: "flex", justifyContent: "center", opacity: o }}>
            <div style={{ maxWidth: 1480, padding: "12px 26px", borderRadius: 16, background: "rgba(3,9,7,.72)", border: "1px solid rgba(255,255,255,.08)", color: C.white, fontFamily: FONT, fontWeight: 600, fontSize: 36, lineHeight: 1.3, textAlign: "center", letterSpacing: "-0.01em" }}>
              {c.text}
            </div>
          </div>
        );
      }
    }
  }
  return null;
};

export const Eyebrow: React.FC<{ children: React.ReactNode; t: number; at: number; x: number; y: number }> = ({ children, t, at, x, y }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity: easeOut(ramp(t, at, at + 0.4)), transform: `translateY(${(1 - easeOut(ramp(t, at, at + 0.4))) * 14}px)`, color: C.mint, fontFamily: FONT, fontWeight: 750, fontSize: 20, letterSpacing: "0.16em", textTransform: "uppercase" }}>
    {children}
  </div>
);
