/**
 * The Chupke design system in code (DESIGN.md is the spec). One inline stylesheet, inline SVG
 * icons, and the page shell. Nothing here loads from a third party: no fonts, scripts or CDNs.
 */

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const ICON_PATHS: Record<string, string> = {
  shield: `<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>`,
  eyeOff: `<path d="M3 12c2.2-3.6 5.3-5.5 9-5.5s6.8 1.9 9 5.5"/><path d="M5.5 15.5l-1.5 2M12 17v2.5M18.5 15.5l1.5 2"/>`,
  once: `<circle cx="12" cy="12" r="8.5"/><path d="M11 9l1.5-1v8"/>`,
  refund: `<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l2.5 2"/>`,
  address: `<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>`,
  trash: `<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>`,
  gauge: `<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l3.5-4"/>`,
  gift: `<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-1.8 0-4.5-.6-4.5-2.6S10.8 4.6 12 9zM12 9c1.8 0 4.5-.6 4.5-2.6S13.2 4.6 12 9z"/>`,
  qr: `<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2M20 14v1.5M14 20h1.5"/>`,
  bolt: `<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>`,
  wallet: `<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M15.5 14h2"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  x: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  server: `<rect x="4" y="4.5" width="16" height="6" rx="1.6"/><rect x="4" y="13.5" width="16" height="6" rx="1.6"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/>`,
  db: `<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>`,
  code: `<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5"/>`,
  copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>`,
  external: `<path d="M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>`,
  github: `<path d="M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4.1.6-.2.6-.4v-1.6c-2.4.5-2.9-1-2.9-1-.4-1-1-1.3-1-1.3-.8-.5.1-.5.1-.5.9.1 1.3.9 1.3.9.8 1.3 2 .9 2.5.7.1-.6.3-.9.6-1.1-1.9-.2-3.9-1-3.9-4.3 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.3.9a8 8 0 0 1 4.2 0c1.6-1.1 2.3-.9 2.3-.9.5 1.2.2 2.1.1 2.3.5.6.9 1.4.9 2.3 0 3.3-2 4-3.9 4.3.3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4A8.5 8.5 0 0 0 12 3.5z"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  activity: `<path d="M3.5 12h4l2.5-6 4 12 2.5-6h4"/>`,
};

/** A 24×24 stroke icon. Decorative unless a label is given. */
export function icon(name: keyof typeof ICON_PATHS | string, size = 20, label?: string): string {
  const fill = name === "github" ? `fill="currentColor" stroke="none"` : `fill="none" stroke="currentColor"`;
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" ${fill} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICON_PATHS[name] ?? ""}</svg>`;
}

/** The mark: a closed eye (चुपके, "quietly") on emerald, with the gold shielded-coin dot. */
export function logoMark(size = 28): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0e5c4a"/><path d="M7.5 14.5c2.3 3.1 5.2 4.7 8.5 4.7s6.2-1.6 8.5-4.7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M10.6 20.2l-1.5 2.3M16 21.6v2.7M21.4 20.2l1.5 2.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="24.3" cy="8.2" r="2.7" fill="#e5ad3c"/></svg>`;
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0e5c4a"/><path d="M7.5 14.5c2.3 3.1 5.2 4.7 8.5 4.7s6.2-1.6 8.5-4.7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24.3" cy="8.2" r="2.9" fill="#e5ad3c"/></svg>`,
)}`;

const CHECK_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
)}`;

export const REPO_URL = "https://github.com/bilgin-kocak/chupke";
const doc = (path: string) => `${REPO_URL}/blob/main/${path}`;

const CSS = `
:root{
--ink:#0b1512;--ink2:#26352f;--mute:#5c6b65;--faint:#8a9792;--hair:#e3e9e6;--hair2:#d3ddd8;
--canvas:#ffffff;--soft:#f5f8f6;--mint:#e7f3ee;--brand:#0e5c4a;--brand2:#0a4538;--brandText:#0b4a3c;--onBrand:#ffffff;
--gold:#e5ad3c;--goldSoft:#fbf2dc;--goldText:#7c5208;--night:#06110d;
--ok:#0f7a56;--okBg:#e3f4ec;--warn:#9a4d06;--warnBg:#fdf0de;--bad:#b42318;--badBg:#fde8e6;--info:#1f53b8;--infoBg:#e8effc;
--r1:8px;--r2:12px;--r3:18px;--r4:26px;
--sh1:0 1px 2px rgba(11,21,18,.06),0 1px 1px rgba(11,21,18,.04);
--sh2:0 14px 34px -16px rgba(11,21,18,.24),0 2px 6px rgba(11,21,18,.05);
--sh3:0 40px 90px -30px rgba(0,0,0,.65),0 14px 30px -14px rgba(0,0,0,.4);
--font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,"Noto Sans","Noto Sans Devanagari",sans-serif;
--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{
--ink:#e8eeeb;--ink2:#c6d1cc;--mute:#97a6a0;--faint:#6f7e78;--hair:#1f2c27;--hair2:#2b3a34;
--canvas:#0b1411;--soft:#08100d;--mint:#10261f;--brand:#2fa37f;--brand2:#3bb58f;--brandText:#74d6b2;--onBrand:#03110b;
--goldSoft:#2a2110;--goldText:#f0c66b;--ok:#4cc896;--okBg:#0e2a20;--warn:#f0a85a;--warnBg:#2b1d0b;--bad:#f2867a;--badBg:#2e1210;--info:#86aaf2;--infoBg:#101d36;
--sh1:0 1px 2px rgba(0,0,0,.4);--sh2:0 16px 40px -18px rgba(0,0,0,.7)}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:80px}
body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.6 var(--font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--brandText);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px}
svg{display:block}.i{flex:none}
h1,h2,h3,h4,h5,p{margin:0}
.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
@media (max-width:640px){.wrap{padding:0 16px}}
.mono{font-family:var(--mono)}.num{font-variant-numeric:tabular-nums}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.76rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--brandText)}
.display{font-size:clamp(2.6rem,6.2vw,4.6rem);line-height:1.01;letter-spacing:-.04em;font-weight:780}
.h2{font-size:clamp(1.9rem,3.6vw,2.8rem);line-height:1.07;letter-spacing:-.03em;font-weight:740}
.h3{font-size:1.1rem;line-height:1.3;letter-spacing:-.012em;font-weight:690}
.lead{font-size:clamp(1.05rem,1.7vw,1.24rem);line-height:1.6;color:var(--mute)}
.muted{color:var(--mute)}
/* nav */
.nav{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--canvas) 84%,transparent);-webkit-backdrop-filter:saturate(1.5) blur(14px);backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid var(--hair)}
.nav .wrap{display:flex;align-items:center;gap:14px;height:66px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);font-weight:780;letter-spacing:-.03em;font-size:1.2rem}
.brand:hover{text-decoration:none}
.brand small{font-size:.72rem;font-weight:650;letter-spacing:0;color:var(--mute);border:1px solid var(--hair2);border-radius:999px;padding:2px 8px;margin-left:2px}
.navlinks{display:flex;gap:2px;margin-left:18px}
.navlinks a{color:var(--mute);font-weight:560;font-size:.93rem;padding:8px 12px;border-radius:999px}
.navlinks a:hover{color:var(--ink);background:var(--soft);text-decoration:none}
.spacer{flex:1}
.nav .gh{display:inline-flex;align-items:center;gap:6px;color:var(--mute);font-size:.9rem;font-weight:600;padding:8px 10px;border-radius:999px}
.nav .gh:hover{color:var(--ink);text-decoration:none}
.nav.dark{background:rgba(6,17,13,.72);border-bottom-color:rgba(255,255,255,.07)}.nav.solid{background:#06110d}
.nav.dark .brand{color:#fff}.nav.dark .brand small{color:rgba(255,255,255,.6);border-color:rgba(255,255,255,.18)}
.nav.dark .navlinks a,.nav.dark .gh{color:rgba(255,255,255,.7)}
.nav.dark .navlinks a:hover,.nav.dark .gh:hover{color:#fff;background:rgba(255,255,255,.07)}
@media (max-width:900px){.navlinks{display:none}}
@media (max-width:480px){.nav .gh span{display:none}}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:650;font-size:.97rem;line-height:1;padding:13px 20px;border-radius:999px;border:1px solid transparent;cursor:pointer;text-decoration:none;white-space:nowrap;transition:transform .12s ease,background .15s ease,border-color .15s ease,box-shadow .15s ease}
.btn:hover{text-decoration:none;transform:translateY(-1px)}.btn:active{transform:none}
.btn-primary{background:var(--brand);color:var(--onBrand);box-shadow:0 10px 22px -10px rgba(14,92,74,.75)}
.btn-primary:hover{background:var(--brand2)}
.btn-ghost{background:var(--canvas);color:var(--ink);border-color:var(--hair2)}.btn-ghost:hover{border-color:var(--mute)}
.btn-light{background:#fff;color:#06110d;box-shadow:0 10px 26px -12px rgba(0,0,0,.6)}
.btn-glass{background:rgba(255,255,255,.06);color:#fff;border-color:rgba(255,255,255,.2)}.btn-glass:hover{background:rgba(255,255,255,.12)}
.btn-sm{padding:9px 14px;font-size:.88rem}.btn-lg{padding:16px 24px;font-size:1.02rem}.btn-block{width:100%}
/* pills and badges */
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:.82rem;font-weight:620;background:var(--mint);color:var(--brandText)}
.pill-night{background:rgba(255,255,255,.06);color:rgba(255,255,255,.86);border:1px solid rgba(255,255,255,.14)}
.dot{width:8px;height:8px;border-radius:50%;background:#35d39a;box-shadow:0 0 0 4px rgba(53,211,154,.2);flex:none}
.dot.off{background:#e5ad3c;box-shadow:0 0 0 4px rgba(229,173,60,.2)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;font-size:.74rem;font-weight:680;white-space:nowrap}
.b-ok{background:var(--okBg);color:var(--ok)}.b-warn{background:var(--warnBg);color:var(--warn)}.b-bad{background:var(--badBg);color:var(--bad)}
.b-info{background:var(--infoBg);color:var(--info)}.b-mute{background:var(--soft);color:var(--mute);box-shadow:inset 0 0 0 1px var(--hair)}.b-gold{background:var(--goldSoft);color:var(--goldText)}
/* hero */
.hero{position:relative;background:var(--night);color:#fff;overflow:hidden;isolation:isolate}
.hero::before{content:"";position:absolute;inset:-25% -10% auto -10%;height:130%;z-index:-2;background:radial-gradient(55% 55% at 80% 32%,rgba(28,140,108,.55),transparent 70%),radial-gradient(38% 42% at 14% 8%,rgba(229,173,60,.2),transparent 70%),radial-gradient(60% 50% at 45% 115%,rgba(14,92,74,.55),transparent 70%)}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(75% 65% at 50% 30%,#000,transparent 78%);mask-image:radial-gradient(75% 65% at 50% 30%,#000,transparent 78%)}
.hero-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:48px;align-items:center;padding-top:76px;padding-bottom:100px}
@media (max-width:980px){.hero-grid{grid-template-columns:1fr;gap:40px;padding-top:44px;padding-bottom:64px}}
.hero .display{margin-top:22px}.hero .lead{color:rgba(255,255,255,.72);max-width:35rem;margin-top:22px}
.accent{background:linear-gradient(92deg,#80e6c1 10%,#ecc66e 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.ctas{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
.trust{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:34px;color:rgba(255,255,255,.66);font-size:.88rem}
.trust span{display:inline-flex;align-items:center;gap:7px}.trust .i{color:#80e6c1}
/* product mockup */
.mock{position:relative;justify-self:center;width:min(100%,450px);height:600px}
.phone{position:absolute;left:0;top:0;width:296px;background:linear-gradient(160deg,#1b2d27,#0c1814);border:1px solid rgba(255,255,255,.14);border-radius:40px;padding:11px;box-shadow:var(--sh3)}
.phone::before{content:"";position:absolute;top:18px;left:50%;transform:translateX(-50%);width:84px;height:22px;border-radius:999px;background:#05100c;z-index:2}
.screen{background:#f6f9f7;color:#0b1512;border-radius:30px;overflow:hidden;padding:44px 18px 20px}
.screen .bar{display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#5c6b65;margin-bottom:10px}
.screen .bar b{color:#0b1512;font-size:.8rem}
.screen .qrbox{background:#fff;border:1px solid #e3e9e6;border-radius:16px;padding:12px}
.screen .qrbox svg{width:100%;height:auto}
.screen .amt{font-size:1.55rem;font-weight:780;letter-spacing:-.03em;text-align:center;margin-top:12px;font-variant-numeric:tabular-nums}
.screen .sub{font-size:.7rem;color:#5c6b65;text-align:center;margin-top:2px}
.screen .ownline{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;font-size:.7rem;font-weight:650;color:#0b4a3c}
.screen .mini{margin-top:12px;display:grid;gap:8px;border-top:1px solid #e3e9e6;padding-top:12px}
.screen .mini div{display:flex;gap:9px;align-items:center;font-size:.74rem;color:#26352f}
.screen .mini i{width:13px;height:13px;border-radius:50%;background:#0e5c4a;flex:none}
.screen .mini i.o{background:#fff;border:2px solid #cfd9d4}
.bubble{position:absolute;right:0;bottom:-34px;width:252px;background:rgba(12,27,22,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:14px 16px 12px;box-shadow:var(--sh3);color:#fff}
.bubble .from{display:flex;align-items:center;gap:8px;font-size:.72rem;color:rgba(255,255,255,.62);margin-bottom:9px}
.bubble .from b{color:#fff;font-size:.78rem}
.bubble .msg{font-family:var(--mono);font-size:.76rem;line-height:1.6;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 12px;white-space:pre-line}
.bubble .lockline{display:flex;align-items:center;gap:6px;font-size:.7rem;color:#80e6c1;margin-top:9px}
@media (max-width:520px){.mock{height:auto;display:flex;flex-direction:column;align-items:center}.phone{position:relative;width:min(100%,290px)}.bubble{position:relative;right:auto;bottom:auto;width:min(92%,280px);margin-top:-64px;align-self:flex-end}}
.hide-sm{}@media (max-width:480px){.hide-sm{display:none}}
/* stats strip */
.strip{border-bottom:1px solid var(--hair);background:var(--canvas)}
.strip .wrap{display:grid;grid-template-columns:repeat(4,1fr)}
.stat{padding:28px 22px;border-left:1px solid var(--hair)}.stat:first-child{border-left:0;padding-left:0}
.stat b{display:block;font-size:clamp(1.6rem,3vw,2.15rem);font-weight:780;letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.1}
.stat span{color:var(--mute);font-size:.9rem}
@media (max-width:760px){.strip .wrap{grid-template-columns:1fr 1fr}.stat{border-left:0;padding-left:0;border-top:1px solid var(--hair)}.stat:nth-child(-n+2){border-top:0}.stat:nth-child(even){border-left:1px solid var(--hair);padding-left:18px}}
/* sections */
.section{padding:104px 0}.section.soft{background:var(--soft);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)}
@media (max-width:640px){.section{padding:68px 0}}
.head{max-width:700px;margin-bottom:46px}.head .h2{margin-top:12px}.head .lead{margin-top:16px}
.head.center{margin-left:auto;margin-right:auto;text-align:center}
.tile{width:44px;height:44px;border-radius:13px;background:var(--mint);color:var(--brandText);display:grid;place-items:center}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.step{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);padding:24px;box-shadow:var(--sh1)}
.step .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.step .n{font-family:var(--mono);font-size:.78rem;color:var(--faint)}
.step p{color:var(--mute);margin-top:8px;font-size:.95rem}
@media (max-width:980px){.steps{grid-template-columns:1fr 1fr}}@media (max-width:560px){.steps{grid-template-columns:1fr}}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:var(--r4);overflow:hidden}
.feature{background:var(--canvas);padding:30px 28px}.feature .h3{margin-top:18px}.feature p{color:var(--mute);margin-top:8px;font-size:.95rem}
@media (max-width:900px){.features{grid-template-columns:1fr 1fr}}@media (max-width:560px){.features{grid-template-columns:1fr}}
.matrix{width:100%;border-collapse:separate;border-spacing:0;background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);overflow:hidden;box-shadow:var(--sh1)}
.matrix th,.matrix td{padding:16px 20px;text-align:left;border-bottom:1px solid var(--hair);vertical-align:top;font-size:.95rem}
.matrix tr:last-child td{border-bottom:0}
.matrix th{font-size:.74rem;text-transform:uppercase;letter-spacing:.09em;color:var(--mute);background:var(--soft);font-weight:700}
.matrix td:first-child{font-weight:680;width:24%}
.matrix .y,.matrix .n{display:flex;gap:9px;align-items:flex-start}.matrix .y .i{color:var(--warn);margin-top:3px}.matrix .n .i{color:var(--ok);margin-top:3px}
@media (max-width:760px){.matrix thead{display:none}.matrix tr{display:block;border-bottom:1px solid var(--hair);padding:14px 16px}.matrix tr:last-child{border-bottom:0}.matrix td{display:block;border:0;padding:4px 0;width:auto!important}}
/* shop */
.shop{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:28px;align-items:start}
@media (max-width:980px){.shop{grid-template-columns:1fr}}
.products{display:grid;gap:12px}
.product{position:relative;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:16px;align-items:center;background:var(--canvas);border:1px solid var(--hair2);border-radius:var(--r3);padding:16px 18px;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .12s}
.product:hover{border-color:var(--brand)}
.product:has(input:checked){border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 20%,transparent)}
.product input{position:absolute;opacity:0;width:1px;height:1px}
.product:has(input:focus-visible){outline:2px solid var(--gold);outline-offset:2px}
.radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--hair2);display:grid;place-items:center;transition:all .15s}
.product:has(input:checked) .radio{border-color:var(--brand);background:var(--brand);box-shadow:inset 0 0 0 4px var(--canvas)}
.gc{width:58px;height:40px;border-radius:9px;position:relative;background:linear-gradient(135deg,#127a60,#0a3e32);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 6px 14px -8px rgba(0,0,0,.5)}
.gc::before{content:"";position:absolute;left:8px;right:24px;bottom:8px;height:3px;border-radius:3px;background:rgba(255,255,255,.45)}
.gc::after{content:"";position:absolute;right:8px;top:8px;width:9px;height:9px;border-radius:50%;background:var(--gold)}
.gc.fail{background:linear-gradient(135deg,#a8452c,#4a1a10)}.gc.big{background:linear-gradient(135deg,#2a62cf,#11306b)}.gc.real{background:linear-gradient(135deg,#3b3f45,#121417)}
.product .t{font-weight:690;display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.35}.product .m{display:block;color:var(--mute);font-size:.87rem;margin-top:4px;line-height:1.45}
.product .p{text-align:right;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap}.product .p small{display:block;color:var(--mute);font-weight:520;font-size:.8rem}
@media (max-width:520px){.product{grid-template-columns:auto minmax(0,1fr) auto;gap:12px}.product .gc{display:none}}
.formcard{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r4);padding:28px;box-shadow:var(--sh2);position:sticky;top:90px}
@media (max-width:980px){.formcard{position:static}}
.formcard .h3{display:flex;align-items:center;gap:10px}
.label{display:block;font-weight:680;margin:22px 0 8px;font-size:.95rem}
textarea{width:100%;min-height:104px;font:13.5px/1.55 var(--mono);padding:12px 14px;border:1px solid var(--hair2);border-radius:var(--r2);background:var(--soft);color:var(--ink);resize:vertical}
textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 20%,transparent);background:var(--canvas)}
.hint{color:var(--mute);font-size:.87rem;margin-top:8px}
.error{display:flex;gap:9px;align-items:flex-start;background:var(--badBg);color:var(--bad);border-radius:var(--r2);padding:11px 13px;font-weight:620;font-size:.92rem;margin-top:14px}
.fine{display:grid;gap:9px;margin-top:20px;padding-top:18px;border-top:1px solid var(--hair);color:var(--mute);font-size:.86rem}
.fine div{display:flex;gap:9px;align-items:flex-start}.fine .i{color:var(--brandText);margin-top:2px}
.live{display:flex;align-items:center;gap:8px;font-size:.84rem;color:var(--mute);margin-top:16px}
/* architecture */
.arch{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:stretch}
.node{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);padding:22px;box-shadow:var(--sh1)}
.node.dark{background:var(--night);color:#fff;border-color:transparent}
.node .h3{margin-top:14px}.node p{color:var(--mute);margin-top:6px;font-size:.92rem}.node.dark p{color:rgba(255,255,255,.66)}
.node.dark .tile{background:rgba(255,255,255,.08);color:#80e6c1}
.node ul{margin:12px 0 0;padding-left:18px;color:var(--mute);font-size:.88rem}.node.dark ul{color:rgba(255,255,255,.66)}
.arrow{display:grid;place-items:center;color:var(--faint)}
@media (max-width:980px){.arch{grid-template-columns:1fr}.arrow{transform:rotate(90deg);height:26px}}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px}
.chip{font-family:var(--mono);font-size:.78rem;padding:6px 10px;border-radius:8px;background:var(--canvas);border:1px solid var(--hair);color:var(--ink2)}
.links{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:28px}
.linkcard{display:block;background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r2);padding:16px 18px;color:var(--ink)}
.linkcard:hover{border-color:var(--brand);text-decoration:none}.linkcard b{display:flex;align-items:center;justify-content:space-between;gap:8px}.linkcard span{display:block;color:var(--mute);font-size:.86rem;margin-top:4px}
@media (max-width:900px){.links{grid-template-columns:1fr 1fr}}@media (max-width:520px){.links{grid-template-columns:1fr}}
/* faq */
.faq{max-width:820px;margin:0 auto;border-top:1px solid var(--hair)}
.faq details{border-bottom:1px solid var(--hair)}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 0;font-weight:660;font-size:1.04rem}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.5rem;line-height:1;color:var(--mute);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin:-4px 0 20px;color:var(--mute);max-width:70ch}
/* cta + footer */
.cta{position:relative;overflow:hidden;isolation:isolate;border-radius:var(--r4);background:var(--night);color:#fff;padding:56px;display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap}
.cta::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(50% 130% at 92% 0%,rgba(28,140,108,.6),transparent 62%),radial-gradient(42% 100% at 0% 100%,rgba(229,173,60,.2),transparent 60%)}
.cta p{color:rgba(255,255,255,.7);margin-top:10px;max-width:34rem}
@media (max-width:640px){.cta{padding:32px 24px}}
.foot{border-top:1px solid var(--hair);padding:60px 0 36px;color:var(--mute);font-size:.92rem}
.foot .cols{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:32px}
.foot h5{margin:0 0 12px;color:var(--ink);font-size:.84rem;font-weight:700}
.foot .cols a{display:block;color:var(--mute);padding:3px 0}.foot .cols a:hover{color:var(--ink)}
.foot .about{max-width:22rem;margin-top:14px}
.foot .legal{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:44px;padding-top:20px;border-top:1px solid var(--hair);font-size:.84rem}
@media (max-width:760px){.foot .cols{grid-template-columns:1fr 1fr}.foot .cols>div:first-child{grid-column:1/-1}}
/* app pages */
.page{padding:36px 0 88px}
.crumbs{display:flex;gap:8px;align-items:center;color:var(--mute);font-size:.88rem;margin-bottom:14px;flex-wrap:wrap}
.crumbs a{color:var(--mute)}
.pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:26px}
.pagehead .h2{margin-top:6px}
.grid2{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:22px;align-items:start}
@media (max-width:920px){.grid2{grid-template-columns:1fr}}
.stack{display:grid;gap:16px}
.card{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);padding:24px;box-shadow:var(--sh1)}
.card>h2{font-size:1rem;font-weight:720;letter-spacing:-.01em;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.paycard{padding:30px 26px}
.qr{background:#fff;border:1px solid var(--hair);border-radius:20px;padding:16px;width:100%;max-width:310px;margin:0 auto;display:block}
.qr svg{width:100%;height:auto;display:block}
.amount{font-size:2.3rem;font-weight:790;letter-spacing:-.035em;text-align:center;margin-top:18px;font-variant-numeric:tabular-nums;line-height:1.1}
.center{text-align:center}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.row.c{justify-content:center}
.own{display:flex;align-items:center;justify-content:center;gap:7px;margin:12px auto 0;color:var(--brandText);font-size:.86rem;font-weight:600}
.countdown{display:flex;align-items:center;justify-content:center;gap:7px;color:var(--mute);font-size:.86rem;margin-top:6px}
.countdown:empty{display:none}
code.memo{display:block;word-break:break-all;white-space:pre-wrap;background:var(--soft);border:1px dashed var(--hair2);border-radius:var(--r2);padding:12px 14px;font:12.5px/1.6 var(--mono);color:var(--ink2)}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:12px 18px;margin:0;font-size:.94rem}
dl.kv dt{color:var(--mute)}dl.kv dd{margin:0;text-align:right;font-weight:620;min-width:0;overflow-wrap:anywhere}
ol.timeline{list-style:none;padding:0;margin:0}
ol.timeline li{position:relative;padding:0 0 18px 34px;color:var(--faint);line-height:20px}
ol.timeline li:last-child{padding-bottom:2px}
ol.timeline li::before{content:"";position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;border:2px solid var(--hair2);background:var(--canvas);box-sizing:border-box}
ol.timeline li::after{content:"";position:absolute;left:9px;top:22px;bottom:-2px;width:2px;background:var(--hair)}
ol.timeline li:last-child::after{display:none}
ol.timeline li.done{color:var(--ink)}
ol.timeline li.done::before{background:var(--brand) url("${CHECK_SVG}") center/11px no-repeat;border-color:var(--brand)}
ol.timeline li.done::after{background:var(--brand)}
ol.timeline li.now{color:var(--ink);font-weight:680}
ol.timeline li.now::before{border-color:var(--brand);box-shadow:0 0 0 5px color-mix(in srgb,var(--brand) 18%,transparent)}
.outcome{margin-top:18px;padding:12px 14px;border-radius:var(--r2);background:var(--okBg);color:var(--ok);font-weight:620;font-size:.93rem}
.outcome:empty{display:none}.outcome.bad{background:var(--warnBg);color:var(--warn)}
ul.who{margin:0;padding:0;list-style:none;display:grid;gap:12px}
ul.who li{display:flex;gap:10px;font-size:.92rem;color:var(--ink2)}ul.who .i{color:var(--brandText);margin-top:3px}
.empty{text-align:center;padding:80px 0}
.empty .h2{margin-top:18px}.empty p{margin-top:12px}
/* console */
.console{background:var(--soft)}
.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
@media (max-width:1180px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:620px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kpi{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);padding:16px 18px;box-shadow:var(--sh1);min-width:0}
.kpi .l{color:var(--mute);font-size:.83rem;display:flex;align-items:center;gap:8px}.kpi .l .i{color:var(--brandText)}
.kpi .v{font-size:1.42rem;font-weight:770;letter-spacing:-.025em;margin-top:8px;font-variant-numeric:tabular-nums;line-height:1.2}
.kpi .s{color:var(--mute);font-size:.8rem;margin-top:3px}
.panel{background:var(--canvas);border:1px solid var(--hair);border-radius:var(--r3);margin-top:20px;box-shadow:var(--sh1);overflow:hidden}
.panel-h{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--hair)}
.panel-h h2{font-size:1rem;font-weight:720}
.tbl{overflow-x:auto}
table.t{border-collapse:collapse;width:100%;font-size:.86rem}
.t th{background:var(--soft);color:var(--mute);font-weight:680;text-align:left;padding:10px 16px;white-space:nowrap;border-bottom:1px solid var(--hair);font-size:.72rem;text-transform:uppercase;letter-spacing:.07em}
.t td{padding:11px 16px;border-bottom:1px solid var(--hair);white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--ink2)}
.t tr:last-child td{border-bottom:0}.t tbody tr:hover td{background:var(--soft)}
.t .mono{font-size:.8rem}.t .wrapcell{white-space:normal;min-width:260px}
.none{padding:22px 20px;color:var(--mute);font-size:.9rem}
`;

export type NavKind = "marketing" | "app" | "console";

function nav(kind: NavKind): string {
  if (kind === "console") {
    return `<header class="nav dark solid"><div class="wrap"><a class="brand" href="/">${logoMark()}chupke<small>operator</small></a>
<div class="spacer"></div><span class="pill pill-night"><span class="dot"></span>Zcash testnet</span><a class="gh" href="${REPO_URL}" rel="noreferrer">${icon("github", 18)}<span>GitHub</span></a></div></header>`;
  }
  const dark = kind === "marketing" ? " dark" : "";
  return `<header class="nav${dark}"><div class="wrap"><a class="brand" href="/">${logoMark()}chupke</a>
<nav class="navlinks" aria-label="Main"><a href="/#how">How it works</a><a href="/#privacy">Privacy</a><a href="/#shop">Shop</a><a href="/#tech">Under the hood</a><a href="/#faq">FAQ</a></nav>
<div class="spacer"></div><a class="gh" href="${REPO_URL}" rel="noreferrer">${icon("github", 18)}<span>GitHub</span></a>
<a class="btn ${kind === "marketing" ? "btn-light" : "btn-primary"} btn-sm" href="/#shop">Buy a test card</a></div></header>`;
}

function footer(): string {
  return `<footer class="foot"><div class="wrap"><div class="cols">
<div><a class="brand" href="/">${logoMark(26)}chupke</a><p class="about">Private checkout for gift cards. Pay in shielded ZEC; the code arrives as an encrypted memo in your own wallet.</p></div>
<div><h5>Product</h5><a href="/#how">How it works</a><a href="/#shop">Shop</a><a href="/#privacy">Who sees what</a><a href="/#faq">FAQ</a></div>
<div><h5>Project</h5><a href="${REPO_URL}" rel="noreferrer">Source code</a><a href="${doc("PRIVACY.md")}" rel="noreferrer">Privacy design</a><a href="${doc("docs/NOTES.md")}" rel="noreferrer">Live test notes</a><a href="${doc("FEEDBACK.md")}" rel="noreferrer">Bitrefill feedback</a></div>
<div><h5>Built with</h5><a href="https://z.cash" rel="noreferrer">Zcash (testnet, NU7)</a><a href="https://github.com/zingolabs/zingolib" rel="noreferrer">zingo-cli</a><a href="https://docs.bitrefill.com" rel="noreferrer">Bitrefill REST v2 + MCP</a></div>
</div><div class="legal"><span>Testnet demo: TAZ coins have no value, and the shop buys Bitrefill's free test products.</span><span>Built in a day at Free Society Hack, Mumbai · 4 Nov 2026 · चुपके means "quietly"</span></div></div></footer>`;
}

export function layout(title: string, body: string, opts: { nav?: NavKind; description?: string; bodyClass?: string; head?: string } = {}): string {
  const description =
    opts.description ?? "Chupke: buy gift cards with shielded ZEC. The code arrives as an encrypted memo in your wallet. No account, no email, automatic refunds.";
  const kind = opts.nav ?? "app";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#06110d"><link rel="icon" href="${FAVICON}">${opts.head ?? ""}<style>${CSS}</style></head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ""}>${kind === "marketing" ? "" : nav(kind)}${body}${kind === "console" ? "" : footer()}</body></html>`;
}

/** The marketing nav sits inside the dark hero, so the landing page renders it there. */
export function marketingNav(): string {
  return nav("marketing");
}
