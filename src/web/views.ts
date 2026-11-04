/** Server-rendered pages. Styling and the page shell live in theme.ts (spec: DESIGN.md). */
import { REPO_URL, esc, icon, layout, logoMark, marketingNav } from "./theme.js";

export { esc } from "./theme.js";

export interface ProductCard {
  sku: string;
  label: string;
  valueUsd: number;
  priceTaz: string;
  kind?: "test" | "real";
  note?: string | undefined;
}

/** Aggregates for the landing page: counts and a median only, nothing that identifies anyone. */
export interface LandingStats {
  delivered: number;
  refunds: number;
  overpaymentsReturned: number;
  medianDeliverySec: number | null;
}

export interface ShopStatus {
  /** The worker ticked recently, so a payment made now is processed now. */
  online: boolean;
  lastTickAgeSec: number | null;
}

const WHO_ROWS: Array<[who: string, sees: string, never: string]> = [
  ["Anyone watching the chain", "That shielded transactions happened, and their fees.", "Who paid whom, the amount, or the memo."],
  ["The light-wallet server", "The shop's IP address and when it syncs.", "Your IP, your address, or the memo."],
  ["This web server", "Your IP and page visits, and your reply address until it is deleted (1 hour after the order ends).", "Your wallet keys or your gift card code."],
  ["The shop operator", "The order, the amount, and your reply address until it is deleted.", "Your wallet keys. The code is never stored."],
  ["Bitrefill", "That the shop bought this gift card from its own balance.", "Who you are, your wallet, your IP, or your payment."],
];

export const WHO_SEES_WHAT = [
  "The blockchain: encrypted data only, not your address, the amount or the memo.",
  "This web server: your IP and page visits, and your reply address until it is deleted (1 hour after the order ends).",
  "The shop operator: the order, the amount and your reply address until it is deleted; never your wallet keys.",
  "Bitrefill: that the shop bought this gift card, never who you are or your wallet.",
];

function cardArt(p: ProductCard): string {
  const cls = p.kind === "real" ? "real" : /fail/.test(p.sku) ? "fail" : p.valueUsd > 10 ? "big" : "";
  return `<span class="gc ${cls}" aria-hidden="true"></span>`;
}

function productBadge(p: ProductCard): string {
  if (p.kind === "real") return `<span class="badge b-gold">Real card · not on sale</span>`;
  if (/fail/.test(p.sku)) return `<span class="badge b-warn">Shows a refund</span>`;
  if (p.valueUsd > 10) return `<span class="badge b-info">Over the cap</span>`;
  return `<span class="badge b-ok">Delivers a code</span>`;
}

function hero(heroQr: string | null): string {
  return `<section class="hero">${marketingNav()}<div class="wrap hero-grid">
<div>
<span class="pill pill-night"><span class="dot"></span><span>Live on Zcash testnet<span class="hide-sm"> · Free Society Hack, Mumbai</span></span></span>
<h1 class="display">Gift cards, bought <span class="accent">quietly.</span></h1>
<p class="lead">Pay with shielded ZEC. Chupke buys the card on Bitrefill and sends the code to your own wallet as an encrypted memo. No account, no email, no card number, and an automatic refund if anything goes wrong.</p>
<div class="ctas"><a class="btn btn-light btn-lg" href="#shop">Buy a test card ${icon("arrow", 18)}</a><a class="btn btn-glass btn-lg" href="#how">How it works</a></div>
<div class="trust"><span>${icon("shield", 16)}Shielded end to end</span><span>${icon("once", 16)}Never charged twice</span><span>${icon("refund", 16)}Automatic refunds</span><span>${icon("eyeOff", 16)}Codes never stored</span></div>
</div>
<div class="mock" aria-label="Product preview: an order's payment QR, and the gift card code arriving in a wallet as an encrypted memo" role="img">
<div class="phone"><div class="screen">
<div class="bar"><b>Order 7QK3V9T2MD</b><span>$10 test card</span></div>
<div class="qrbox">${heroQr ?? ""}</div>
<div class="amt">0.01 TAZ</div><div class="sub">Pay within 19:46</div>
<div class="ownline">${icon("address", 13)}Address used for this order only</div>
<div class="mini"><div><i></i>Payment seen</div><div><i></i>Payment confirmed</div><div><i></i>Buying your gift card</div><div><i class="o"></i>Code sent to your wallet</div></div>
</div></div>
<div class="bubble"><div class="from">${logoMark(20)}<b>Chupke</b><span>· shielded memo · now</span></div>
<div class="msg">Chupke #7QK3V9T2MD delivered
Test gift card
Code: 46&#8226;&#8226;-&#8226;&#8226;&#8226;&#8226;-&#8226;&#8226;57</div>
<div class="lockline">${icon("lock", 13)}Only your wallet can read this</div></div>
</div></div></section>`;
}

function statsStrip(s: LandingStats | undefined): string {
  if (s && s.delivered > 0) {
    const median = s.medianDeliverySec === null ? "–" : s.medianDeliverySec < 120 ? `${s.medianDeliverySec} s` : `${Math.round(s.medianDeliverySec / 60)} min`;
    return `<section class="strip" aria-label="Live testnet numbers"><div class="wrap">
<div class="stat"><b>${esc(s.delivered)}</b><span>gift cards delivered on testnet</span></div>
<div class="stat"><b>${esc(s.refunds)}</b><span>automatic refunds sent</span></div>
<div class="stat"><b>${esc(median)}</b><span>median from payment to code</span></div>
<div class="stat"><b>0</b><span>gift card codes stored, ever</span></div>
</div></section>`;
  }
  return `<section class="strip"><div class="wrap">
<div class="stat"><b>1</b><span>payment, one memo, one code</span></div>
<div class="stat"><b>$10</b><span>per-order cap, $30 a day</span></div>
<div class="stat"><b>1 h</b><span>until your reply address is deleted</span></div>
<div class="stat"><b>0</b><span>gift card codes stored, ever</span></div>
</div></section>`;
}

const STEPS: Array<[icon: string, title: string, text: string]> = [
  ["gift", "Pick a card", "Choose a gift card and paste a fresh shielded address from your wallet. That's where your code, or a refund, will go."],
  ["qr", "Pay shielded ZEC", "Scan the ZIP 321 QR. It fills in the amount, the order's own address and a memo with your order and reply address."],
  ["bolt", "Chupke buys it", "After one confirmation the worker checks the caps and the allowlist, then buys the card on Bitrefill from the shop's own balance."],
  ["wallet", "The code lands in your wallet", "The code comes back as an encrypted memo only your wallet can read. If anything fails, the memo is a refund with the reason."],
];

const FEATURES: Array<[icon: string, title: string, text: string]> = [
  ["shield", "Private by default", "Payment, delivery and refund are all shielded Zcash transactions. Observers see encrypted outputs, not who paid whom or what for."],
  ["once", "Never charged twice", "Every payment is processed once and every order bought at most once, even through crashes, restarts and full rescans."],
  ["refund", "Refunds without asking", "Underpaid, over the cap, product failed, quote expired, paid twice: each one is refunded automatically, with the reason in the memo."],
  ["address", "A fresh address per order", "Each order gets its own diversified shop address (ZIP 316), so order pages and payment requests can't be linked to each other."],
  ["trash", "Nothing kept that matters", "Codes are fetched at send time and never stored. Reply addresses are deleted an hour after the order ends. Logs are scrubbed."],
  ["gauge", "Guardrails, not approvals", "Allowlisted products only, $10 per order and $30 a day. Anything outside the rules is refused and refunded, with no human in the loop."],
];

const FAQ: Array<[q: string, a: string]> = [
  ["Is this real money?", "No. Chupke runs on Zcash testnet, whose TAZ coins have no value, and the shop buys Bitrefill's free test products. The real-card path is built and guarded, but switched off."],
  ["Which wallet do I need?", "Any Zcash testnet wallet that can send a shielded payment with a memo to a unified address. Our test payments came from zingo-cli. If your wallet doesn't pre-fill the memo from the QR, copy it from the order page."],
  ["What happens if something fails?", "You get an automatic refund of the full amount, sent to your reply address. The memo says why: underpaid, over the limit, the card failed, the quote expired or a duplicate payment."],
  ["Can I be charged twice?", "No. Every received payment is processed exactly once, and each order is bought at most once. We tested a hard kill of the worker in the middle of a delivery: it still sent exactly one code."],
  ["What does Chupke keep about me?", "Never the gift card code: it is fetched at send time and written straight into your encrypted memo. Your reply address is deleted an hour after the order ends. There are no accounts and no emails."],
  ["I paid too much. Do I get it back?", "Yes. After the card is delivered, anything over the price comes back to your reply address with its own memo, as long as it's worth a network fee (0.0002 TAZ or more)."],
  ["Who holds my money while I wait?", "The shop does, for the minute or so between your payment and the delivery. The guarantee is operational (caps, exactly-once purchasing and automatic refunds), not a trustless escrow. The privacy design spells out every trade-off."],
];

export function homePage(p: {
  products: ProductCard[];
  error?: string;
  sku?: string;
  reply?: string;
  stats?: LandingStats;
  heroQr?: string | null;
  shop?: ShopStatus;
}): string {
  const cards = p.products
    .map(
      (c, i) => `<label class="product"><input type="radio" name="sku" value="${esc(c.sku)}" ${(p.sku ? p.sku === c.sku : i === 0) ? "checked" : ""}>
<span class="radio" aria-hidden="true"></span>${cardArt(c)}<span><span class="t">${esc(c.label)} ${productBadge(c)}</span>${c.note ? `<span class="m">${esc(c.note)}</span>` : ""}</span>
<span class="p num">${esc(c.priceTaz)} TAZ<small>$${esc(c.valueUsd)} face value</small></span></label>`,
    )
    .join("");
  const shop = p.shop;
  const live = shop
    ? shop.online
      ? `<div class="live"><span class="dot"></span>Shop online · payments are processed within a minute of confirming</div>`
      : `<div class="live"><span class="dot off"></span>Shop worker is offline right now · your order waits until it's back</div>`
    : "";
  const body = `${hero(p.heroQr ?? null)}${statsStrip(p.stats)}
<section class="section" id="how"><div class="wrap">
<div class="head"><span class="eyebrow">How it works</span><h2 class="h2">From QR code to gift card code in about a minute.</h2>
<p class="lead">No sign-up and no card details. Your wallet is the account, and an encrypted memo is the receipt.</p></div>
<div class="steps">${STEPS.map(
    ([ic, t, d], i) => `<div class="step"><div class="top"><span class="tile">${icon(ic, 22)}</span><span class="n">0${i + 1}</span></div><h3 class="h3">${esc(t)}</h3><p>${esc(d)}</p></div>`,
  ).join("")}</div>
</div></section>
<section class="section soft" id="features"><div class="wrap">
<div class="head"><span class="eyebrow">Why Chupke</span><h2 class="h2">Private by default. Safe by design.</h2>
<p class="lead">An agent that spends money has to be boring in the best way: bounded, exactly-once, and quick to give money back.</p></div>
<div class="features">${FEATURES.map(([ic, t, d]) => `<div class="feature"><span class="tile">${icon(ic, 22)}</span><h3 class="h3">${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
</div></section>
<section class="section" id="privacy"><div class="wrap">
<div class="head"><span class="eyebrow">Who sees what</span><h2 class="h2">Every party, and what it learns.</h2>
<p class="lead">Naming the gaps costs nothing, so here they all are. The full threat model is in the <a href="${REPO_URL}/blob/main/PRIVACY.md" rel="noreferrer">privacy design</a>.</p></div>
<table class="matrix"><thead><tr><th>Who</th><th>Sees</th><th>Never sees</th></tr></thead><tbody>${WHO_ROWS.map(
    ([w, s, n]) => `<tr><td>${esc(w)}</td><td><span class="y">${icon("eyeOff", 16)}<span>${esc(s)}</span></span></td><td><span class="n">${icon("check", 16)}<span>${esc(n)}</span></span></td></tr>`,
  ).join("")}</tbody></table>
</div></section>
<section class="section soft" id="shop"><div class="wrap">
<div class="head"><span class="eyebrow">Shop</span><h2 class="h2">Try it with testnet coins.</h2>
<p class="lead">Each test card shows a different path: a delivered code, a failed purchase and its refund, or the per-order cap.</p></div>
<form method="post" action="/orders" class="shop">
<div class="products" role="radiogroup" aria-label="Gift card">${cards}</div>
<div class="formcard"><h3 class="h3">${icon("wallet", 20)}Where should we send it?</h3>
<label class="label" for="reply">Your reply address</label>
<textarea id="reply" name="reply" rows="3" required spellcheck="false" autocomplete="off" placeholder="utest1…"${p.error ? " autofocus" : ""}>${esc(p.reply ?? "")}</textarea>
<p class="hint">Paste a fresh shielded address from your wallet (starts with utest1). Your code or refund is sent here.</p>
${p.error ? `<p class="error" role="alert">${icon("x", 18)}<span>${esc(p.error)}</span></p>` : ""}
<p style="margin-top:20px"><button class="btn btn-primary btn-lg btn-block" type="submit">Get payment QR ${icon("arrow", 18)}</button></p>
${live}
<div class="fine"><div>${icon("check", 16)}<span>The address's checksum is verified before any money moves.</span></div><div>${icon("check", 16)}<span>Quotes hold for 20 minutes. Late payments are refunded.</span></div><div>${icon("check", 16)}<span>Demo rate: testnet coins have no value.</span></div></div>
</div></form>
</div></section>
<section class="section" id="tech"><div class="wrap">
<div class="head"><span class="eyebrow">Under the hood</span><h2 class="h2">Two processes, and only one of them holds keys.</h2>
<p class="lead">The public web server can't spend anything. The worker that can is never exposed to the internet.</p></div>
<div class="arch">
<div class="node"><span class="tile">${icon("server", 22)}</span><h3 class="h3">Web (public)</h3><p>Order pages, QR codes and live status. Holds no wallet, no viewing key and no Bitrefill key.</p></div>
<div class="arrow">${icon("arrow", 22)}</div>
<div class="node"><span class="tile">${icon("db", 22)}</span><h3 class="h3">SQLite (WAL)</h3><p>Orders and state. Every received output is inserted once; every state change is committed before money moves.</p></div>
<div class="arrow">${icon("arrow", 22)}</div>
<div class="node dark"><span class="tile">${icon("lock", 22)}</span><h3 class="h3">Worker (private)</h3><p>The exactly-once state machine.</p><ul><li>A view-only inbox watches for payments</li><li>The shop wallet sends codes and refunds</li><li>Bitrefill REST v2 buys; MCP finds products</li></ul></div>
</div>
<div class="chips">${["TypeScript", "Hono", "SQLite WAL", "zingo-cli 0.5", "ZIP 321 payment URIs", "ZIP 316 diversified addresses", "ZIP 317 fees", "Bitrefill REST v2", "Bitrefill MCP", "Docker", "Nym build in CI"]
    .map((c) => `<span class="chip">${esc(c)}</span>`)
    .join("")}</div>
<div class="links">
<a class="linkcard" href="${REPO_URL}" rel="noreferrer"><b>Source code ${icon("external", 16)}</b><span>README, tests, Docker</span></a>
<a class="linkcard" href="${REPO_URL}/blob/main/PRIVACY.md" rel="noreferrer"><b>Privacy design ${icon("external", 16)}</b><span>What's private, and what isn't</span></a>
<a class="linkcard" href="${REPO_URL}/blob/main/docs/EVIDENCE.md" rel="noreferrer"><b>Testnet evidence ${icon("external", 16)}</b><span>Real txids and invoices</span></a>
<a class="linkcard" href="${REPO_URL}/blob/main/FEEDBACK.md" rel="noreferrer"><b>Bitrefill feedback ${icon("external", 16)}</b><span>What worked, what didn't</span></a>
</div>
</div></section>
<section class="section soft" id="faq"><div class="wrap">
<div class="head center"><span class="eyebrow">FAQ</span><h2 class="h2">Questions, answered plainly.</h2></div>
<div class="faq">${FAQ.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
</div></section>
<section class="section"><div class="wrap"><div class="cta"><div><h2 class="h2">Buy quietly.</h2><p>A test gift card costs 0.01 TAZ and takes about a minute. Bring a testnet wallet and a fresh address.</p></div>
<a class="btn btn-light btn-lg" href="#shop">Get a payment QR ${icon("arrow", 18)}</a></div></div></section>`;
  return layout("Chupke · gift cards, bought quietly with shielded ZEC", body, { nav: "marketing" });
}

export function orderPage(p: {
  id: string;
  label: string;
  priceTaz: string;
  expiresAt: number;
  uri: string | null;
  memo: string | null;
  qr: string | null;
  /** The QR pays this order's own diversified address rather than the shared shop address. */
  ownAddress: boolean;
  statusJson: string;
}): string {
  const expiresIst = new Date(p.expiresAt + 5.5 * 3600_000).toISOString().slice(11, 16);
  const pay = p.uri
    ? `<div class="card paycard"><div class="qr" aria-label="Payment QR code">${p.qr}</div>
<p class="amount">${esc(p.priceTaz)} TAZ</p>
<p class="hint center">Send exactly this amount; your wallet adds the network fee.</p>
${p.ownAddress ? `<p class="own">${icon("address", 16)}<span>This payment address is used for this order only.</span></p>` : ""}
<p class="countdown" id="countdown"></p>
<div class="row c" style="margin-top:18px"><a class="btn btn-primary" href="${esc(p.uri)}">${icon("wallet", 18)}Open in wallet</a>
<button class="btn btn-ghost" type="button" data-copy="${esc(p.uri)}">${icon("copy", 17)}Copy payment link</button></div></div>
<div class="card"><h2>Memo <span class="badge b-mute">your wallet should fill it in</span></h2>
<code class="memo" id="memo">${esc(p.memo ?? "")}</code>
<div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(p.memo ?? "")}">${icon("copy", 16)}Copy memo</button></div>
<p class="hint">If your wallet doesn't pre-fill the memo, paste it exactly. Without it the shop can't send your code or a refund.</p></div>`
    : `<div class="card"><h2>Payment details</h2><p class="muted">The payment details for this order are no longer shown (the reply address was deleted after the order ended).</p></div>`;
  const body = `<main class="page"><div class="wrap">
<div class="crumbs"><a href="/">Chupke</a><span>/</span><a href="/#shop">Shop</a><span>/</span><span class="mono">${esc(p.id)}</span></div>
<div class="pagehead"><div><span class="eyebrow">Order ${esc(p.id)}</span><h1 class="h2">${esc(p.label)}</h1></div>
<div class="row">${p.ownAddress ? `<span class="badge b-ok">${icon("address", 13)}Own payment address</span>` : ""}<span class="badge b-mute">${icon("shield", 13)}Shielded checkout</span></div></div>
<div class="grid2"><div class="stack">${pay}</div>
<div class="stack">
<div class="card"><h2>Status</h2><ol class="timeline" id="timeline"></ol><p class="outcome" id="outcome"></p></div>
<div class="card"><h2>Order summary</h2><dl class="kv"><dt>Product</dt><dd>${esc(p.label)}</dd><dt>Order</dt><dd class="mono">${esc(p.id)}</dd><dt>Price</dt><dd class="num">${esc(p.priceTaz)} TAZ</dd><dt>Quote holds until</dt><dd class="num">${esc(expiresIst)} IST</dd><dt>Delivery</dt><dd>Encrypted memo to your wallet</dd></dl></div>
<div class="card"><h2>Who can see what</h2><ul class="who">${WHO_SEES_WHAT.map((l) => `<li>${icon("eyeOff", 16)}<span>${esc(l)}</span></li>`).join("")}</ul>
<p class="hint" style="margin-top:14px">The code is never shown on this page: it arrives only in your wallet's encrypted memo inbox.</p></div>
</div></div></div></main>
<script>
(function(){
var id=${JSON.stringify(p.id)}, expiresAt=${JSON.stringify(p.expiresAt)}, s=${p.statusJson};
var steps=[["waiting","Waiting for your payment"],["seen","Payment seen"],["confirmed","Payment confirmed"],["buying","Buying your gift card"],["delivered","Gift card bought"],["sent","Code sent to your wallet"]];
var order=steps.map(function(x){return x[0]});
function render(s){
  var tl=document.getElementById("timeline"), out=document.getElementById("outcome"), at=order.indexOf(s.stage);
  tl.innerHTML="";
  steps.forEach(function(x,i){var li=document.createElement("li");li.textContent=x[1];if(at>=0&&i<at)li.className="done";if(i===at)li.className=s.stage==="sent"?"done":"now";tl.appendChild(li);});
  out.className="outcome"; out.textContent="";
  if(s.stage==="sent"&&s.deliveryTxid){out.innerHTML="";out.appendChild(document.createTextNode("Check your wallet's memos. "));var a=document.createElement("a");a.href=s.explorer+s.deliveryTxid;a.textContent="Delivery on the explorer";a.rel="noreferrer";out.appendChild(a);
    if(s.overpayZat){var taz=(s.overpayZat/1e8).toFixed(8).replace(/0+$/,"").replace(/\\.$/,"");out.appendChild(document.createElement("br"));out.appendChild(document.createTextNode("You paid "+taz+" TAZ more than the price: "+(s.overpayState==="refunded"?"returned. ":s.overpayState==="held"?"held for review. ":"being returned. ")));
      if(s.overpayRefundTxid){var o=document.createElement("a");o.href=s.explorer+s.overpayRefundTxid;o.textContent="Return on the explorer";o.rel="noreferrer";out.appendChild(o);}}}
  if(s.stage==="sent"&&s.overpayZat&&s.overpayState!=="refunded"&&s.overpayState!=="held"){setTimeout(poll,3000);}
  if(s.stage==="refunding"){out.className="outcome bad";out.textContent="Refund on its way: "+(s.reasonText||"");}
  if(s.stage==="refunded"){out.className="outcome bad";out.textContent="Refunded: "+(s.reasonText||"")+". ";if(s.refundTxid){var r=document.createElement("a");r.href=s.explorer+s.refundTxid;r.textContent="Refund on the explorer";r.rel="noreferrer";out.appendChild(r);}}
  if(s.stage==="expired"){out.className="outcome bad";out.textContent="This quote expired. Start a new order.";}
  if(s.stage==="held"){out.className="outcome bad";out.textContent="Payment held for review: "+(s.reasonText||"");}
}
function terminal(st){return ["sent","refunded","expired","held"].indexOf(st)>=0;}
function poll(){fetch("/api/o/"+id,{cache:"no-store"}).then(function(r){return r.json()}).then(function(n){s=n;render(s);if(!terminal(s.stage))setTimeout(poll,3000);}).catch(function(){setTimeout(poll,5000)});}
function tick(){var el=document.getElementById("countdown");if(!el)return;var ms=expiresAt-Date.now();if(s.stage!=="waiting"){el.textContent="";return;}if(ms<=0){el.textContent="This quote has expired.";return;}var m=Math.floor(ms/60000),sec=Math.floor(ms%60000/1000);el.textContent="Pay within "+m+":"+(sec<10?"0":"")+sec;}
document.querySelectorAll("[data-copy]").forEach(function(b){b.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){var t=b.innerHTML;b.textContent="Copied";setTimeout(function(){b.innerHTML=t},1200)})})});
render(s); tick(); setInterval(tick,1000); if(!terminal(s.stage)) setTimeout(poll,3000);
})();
</script>`;
  return layout(`Order ${p.id} · Chupke`, body, { nav: "app" });
}

export interface DashboardData {
  now: number;
  spendUsd: number;
  maxOrderUsd: number;
  maxDailyUsd: number;
  dailyCapIncludesTest: boolean;
  kv: Record<string, { v: string; updated_at: number } | undefined>;
  /** Free per-order addresses ready to hand out (null: the shop wallet isn't known yet). */
  poolFree: number | null;
  orders: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  fulfillments: Array<Record<string, unknown>>;
  events: Array<{ at: number; type: string; order_id: string | null; detail: string | null }>;
  explorer: string;
}

function ist(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms + 5.5 * 3600_000).toISOString().replace("T", " ").slice(5, 19);
}

const GOOD = new Set(["delivered", "memo_sent", "accepted", "sent"]);
const WARN = new Set(["refunded", "refunding", "refund_pending", "refund_sending", "expired", "pending", "sending"]);
const BAD = new Set(["held", "failed", "error", "tick_error"]);

/** A status pill: green for done, amber for money going back, red for needs-a-human, blue for in flight. */
function pill(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  const cls = GOOD.has(s) ? "b-ok" : BAD.has(s) ? "b-bad" : WARN.has(s) ? "b-warn" : s === "awaiting_payment" || s === "ignored_dust" ? "b-mute" : "b-info";
  return `<span class="badge ${cls}">${esc(s.replaceAll("_", " "))}</span>`;
}

function table(rows: Array<Record<string, unknown>>, cols: Array<[string, (r: Record<string, unknown>) => string]>): string {
  if (rows.length === 0) return `<p class="none">Nothing here yet.</p>`;
  return `<div class="tbl"><table class="t"><thead><tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map(([, f]) => `<td>${f(r)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function dashboardPage(d: DashboardData): string {
  const tx = (id: unknown) =>
    typeof id === "string" && id ? `<a class="mono" href="${esc(d.explorer + id)}" rel="noreferrer">${esc(id.slice(0, 10))}…</a>` : "";
  const mask = (ua: unknown) => (typeof ua === "string" && ua ? `<span class="mono">${esc(ua.slice(0, 8))}…</span>` : "");
  const t = (v: unknown) => esc(typeof v === "number" ? ist(v) : "");
  const s = (v: unknown) => esc(v === null || v === undefined ? "" : String(v));
  const wallet = d.kv.wallet_balance ? (JSON.parse(d.kv.wallet_balance.v) as { spendableZat: number; totalZat: number }) : null;
  const br = d.kv.bitrefill_balance ? (JSON.parse(d.kv.bitrefill_balance.v) as { balance?: number | string; currency?: string }) : null;
  const lastTick = d.kv.last_tick_at ? Number(d.kv.last_tick_at.v) : null;
  const tickAge = lastTick ? Math.round((d.now - lastTick) / 1000) : null;
  const online = tickAge !== null && tickAge < 90;
  const kpi = (ic: string, label: string, value: string, sub = "") =>
    `<div class="kpi"><div class="l">${icon(ic, 16)}${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const panel = (title: string, sub: string, inner: string) =>
    `<section class="panel"><div class="panel-h"><h2>${esc(title)}</h2><span class="muted" style="font-size:.84rem">${esc(sub)}</span></div>${inner}</section>`;
  const body = `<main class="page console"><div class="wrap">
<div class="pagehead"><div><span class="eyebrow">Operator console</span><h1 class="h2">Dashboard</h1>
<p class="muted" style="margin-top:8px">Addresses are masked to 8 characters. Redemption codes are never stored, so they can't be shown.</p></div>
<div class="row"><span class="badge ${online ? "b-ok" : "b-warn"}"><span class="dot${online ? "" : " off"}"></span>Worker ${online ? "online" : "offline"}</span><span class="badge b-mute">Refreshes every 10 s</span></div></div>
<div class="kpis">
${kpi("gauge", "Today's spend (IST)", `$${d.spendUsd.toFixed(2)}`, `of $${d.maxDailyUsd}${d.dailyCapIncludesTest ? "" : " (real products)"}`)}
${kpi("shield", "Per-order cap", `$${d.maxOrderUsd}`, "above it: refunded")}
${kpi("wallet", "Shop wallet", wallet ? `${(wallet.spendableZat / 1e8).toFixed(4)} TAZ` : "?", wallet ? `spendable · ${(wallet.totalZat / 1e8).toFixed(4)} total` : "")}
${kpi("gift", "Bitrefill balance", br ? `${esc(String(br.balance ?? "?"))} ${esc(br.currency ?? "")}` : "?", "test products are free")}
${kpi("activity", "Last tick", tickAge !== null ? `${tickAge} s ago` : "never", `chain height ${esc(d.kv.chain_height?.v ?? "?")}`)}
${kpi("address", "Fresh addresses", d.poolFree === null ? "?" : String(d.poolFree), "one per order, ready")}
</div>
${panel(
  "Orders",
  `latest ${d.orders.length}`,
  table(d.orders, [
    ["order", (r) => `<a class="mono" href="/o/${esc(String(r.id))}">${esc(String(r.id))}</a>`],
    ["product", (r) => s(r.sku)],
    ["status", (r) => pill(r.status)],
    ["$", (r) => s(r.value_usd)],
    ["zat", (r) => s(r.price_zat)],
    ["reply", (r) => mask(r.reply_ua)],
    ["pays to", (r) => (r.pay_ua ? mask(r.pay_ua) : `<span class="muted">shop UA</span>`)],
    ["created (IST)", (r) => t(r.created_at)],
  ]),
)}
${panel(
  "Payments",
  "every received output, once",
  table(d.payments, [
    ["txid", (r) => tx(r.txid)],
    ["order", (r) => `<span class="mono">${s(r.order_id)}</span>`],
    ["zat", (r) => s(r.amount_zat)],
    ["state", (r) => pill(r.state)],
    ["reason", (r) => s(r.reason)],
    ["conf", (r) => s(r.confirmations)],
    ["reply", (r) => mask(r.reply_ua)],
    ["refund", (r) => tx(r.refund_txid)],
    ["overpay", (r) => (r.excess_zat ? `${s(r.excess_zat)} ${pill(r.excess_state)} ${tx(r.excess_txid)}` : "")],
    ["seen (IST)", (r) => t(r.first_seen_at)],
  ]),
)}
${panel(
  "Fulfillments",
  "one per order, ever",
  table(d.fulfillments, [
    ["order", (r) => `<span class="mono">${s(r.order_id)}</span>`],
    ["state", (r) => pill(r.state)],
    ["Bitrefill invoice", (r) => `<span class="mono">${s(r.invoice_id)}</span>`],
    ["invoice status", (r) => s(r.invoice_status)],
    ["delivery", (r) => tx(r.delivery_txid)],
    ["error", (r) => s(r.error)],
    ["attempts", (r) => s(r.attempts)],
    ["updated (IST)", (r) => t(r.updated_at)],
  ]),
)}
${panel(
  "Events",
  "newest first",
  table(d.events as unknown as Array<Record<string, unknown>>, [
    ["at (IST)", (r) => t(r.at)],
    ["type", (r) => `<span class="mono">${s(r.type)}</span>`],
    ["order", (r) => `<span class="mono">${s(r.order_id)}</span>`],
    ["detail", (r) => `<span class="wrapcell">${s(r.detail)}</span>`],
  ]),
)}
</div></main>`;
  return layout("Dashboard · Chupke operator", body, { nav: "console", bodyClass: "console", head: `<meta http-equiv="refresh" content="10">` });
}

export function notFoundPage(): string {
  return layout(
    "Not found · Chupke",
    `<main class="page"><div class="wrap empty"><span class="tile" style="margin:0 auto">${icon("eyeOff", 22)}</span><h1 class="h2">Nothing to see here.</h1>
<p class="lead">That page or order doesn't exist. Order links are 10 characters, letters and digits.</p>
<div class="row c" style="margin-top:26px"><a class="btn btn-primary" href="/">Back to Chupke</a><a class="btn btn-ghost" href="/#shop">Buy a test card</a></div></div></main>`,
  );
}
