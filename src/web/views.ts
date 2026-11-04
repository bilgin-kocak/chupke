/** Server-rendered HTML. One inline CSS block, first-party inline JS, no external assets. */

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const PITCH =
  "Pay shielded ZEC from your Zcash wallet and get a gift card code delivered to your encrypted memo inbox: no account, no email, automatic refund if anything fails, never charged twice.";

const CSS = `
:root{--fg:#15171a;--muted:#5d6570;--bg:#f6f5f1;--card:#fff;--line:#dedbd2;--accent:#1f5f4a;--warn:#8a4b00;--bad:#9b1c1c}
@media (prefers-color-scheme:dark){:root{--fg:#ecebe7;--muted:#a5a9ad;--bg:#121314;--card:#1b1d1f;--line:#2e3134;--accent:#6cc3a0;--warn:#e0a458;--bad:#f08a8a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:2rem;margin:.2em 0 .1em;letter-spacing:-.02em}h2{font-size:1.1rem;margin:1.6em 0 .5em}
p.lead{color:var(--muted);margin-top:0}a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.products{display:grid;gap:10px}
.product{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer}
.product input{width:20px;height:20px;accent-color:var(--accent)}
.product .name{font-weight:600}.product .meta{color:var(--muted);font-size:.92rem}
label.field{display:block;font-weight:600;margin:18px 0 6px}
.hint{color:var(--muted);font-size:.9rem;margin:4px 0 0}
textarea,input[type=text]{width:100%;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}
button,.btn{display:inline-block;font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;text-decoration:none;cursor:pointer}
@media (prefers-color-scheme:dark){button,.btn{color:#0d1411}}
button.ghost,.btn.ghost{background:transparent;color:var(--accent)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.error{color:var(--bad);font-weight:600}
.qr{background:#fff;border-radius:12px;padding:8px;width:100%;max-width:300px;margin:0 auto;display:block}.qr svg{width:100%;height:auto;display:block}
.amount{font-size:1.6rem;font-weight:700}
code.memo{display:block;word-break:break-all;white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:.85rem}
ol.timeline{list-style:none;padding:0;margin:0}ol.timeline li{padding:6px 0 6px 28px;position:relative;color:var(--muted)}
ol.timeline li::before{content:"";position:absolute;left:6px;top:13px;width:10px;height:10px;border-radius:50%;border:2px solid var(--line)}
ol.timeline li.done{color:var(--fg)}ol.timeline li.done::before{background:var(--accent);border-color:var(--accent)}
ol.timeline li.now{color:var(--fg);font-weight:600}ol.timeline li.now::before{border-color:var(--accent)}
.outcome{font-weight:600;margin-top:8px}.outcome.bad{color:var(--warn)}
ul.who{margin:0;padding-left:18px}ul.who li{margin:4px 0}
footer{color:var(--muted);font-size:.85rem;margin-top:32px}
`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="referrer" content="no-referrer"><style>${CSS}</style></head>
<body><main>${body}<footer>Chupke runs on Zcash testnet. Demo rate: testnet coins have no value.</footer></main></body></html>`;
}

export interface ProductCard {
  sku: string;
  label: string;
  valueUsd: number;
  priceTaz: string;
}

export function homePage(p: { products: ProductCard[]; error?: string; sku?: string; reply?: string }): string {
  const cards = p.products
    .map(
      (c, i) => `<label class="product"><input type="radio" name="sku" value="${esc(c.sku)}" ${(p.sku ? p.sku === c.sku : i === 0) ? "checked" : ""}>
<span><span class="name">${esc(c.label)}</span><br><span class="meta">$${esc(c.valueUsd)} face value · ${esc(c.priceTaz)} TAZ</span></span></label>`,
    )
    .join("");
  return layout(
    "Chupke — Buy quietly.",
    `<h1>Buy quietly.</h1><p class="lead">${esc(PITCH)}</p>
<form method="post" action="/orders">
<div class="products">${cards}</div>
<label class="field" for="reply">Your reply address</label>
<textarea id="reply" name="reply" rows="3" required spellcheck="false" autocomplete="off" placeholder="utest1…">${esc(p.reply ?? "")}</textarea>
<p class="hint">Paste a fresh shielded address from your wallet (starts with utest1). Your code or refund is sent here.</p>
${p.error ? `<p class="error" role="alert">${esc(p.error)}</p>` : ""}
<p><button type="submit">Get payment QR</button></p>
</form>
<p class="hint">Demo rate: testnet coins have no value.</p>`,
  );
}

export const WHO_SEES_WHAT = [
  "The blockchain: encrypted data only, not your address, the amount or the memo.",
  "This web server: your IP and page visits, and your reply address until it is deleted (1 hour after the order ends).",
  "The shop operator: the order, the amount and your reply address until it is deleted; never your wallet keys.",
  "Bitrefill: that the shop bought this gift card, never who you are or your wallet.",
];

export function orderPage(p: {
  id: string;
  label: string;
  priceTaz: string;
  expiresAt: number;
  uri: string | null;
  memo: string | null;
  qr: string | null;
  statusJson: string;
}): string {
  const pay = p.uri
    ? `<div class="card"><div class="qr" aria-label="Payment QR code">${p.qr}</div>
<p class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="${esc(p.uri)}">Open in wallet</a>
<button class="ghost" type="button" data-copy="${esc(p.uri)}">Copy payment link</button></p>
<p style="text-align:center;margin:8px 0 0"><span class="amount">${esc(p.priceTaz)} TAZ</span><br><span class="hint">Send exactly this amount; your wallet adds the network fee.</span></p>
<p style="text-align:center" class="hint" id="countdown"></p></div>
<h2>Memo (your wallet should fill it in)</h2>
<code class="memo" id="memo">${esc(p.memo ?? "")}</code>
<p class="row"><button class="ghost" type="button" data-copy="${esc(p.memo ?? "")}">Copy memo</button>
<span class="hint">If your wallet doesn't pre-fill the memo, paste it exactly. Without it the shop can't send your code or a refund.</span></p>`
    : `<div class="card"><p>The payment details for this order are no longer shown (the reply address was deleted after the order ended).</p></div>`;
  return layout(
    `Chupke order ${p.id}`,
    `<p class="hint"><a href="/">← Chupke</a></p><h1>${esc(p.label)}</h1><p class="lead">Order ${esc(p.id)}</p>
${pay}
<h2>Status</h2><div class="card"><ol class="timeline" id="timeline"></ol><p class="outcome" id="outcome"></p></div>
<h2>Who can see what</h2><div class="card"><ul class="who">${WHO_SEES_WHAT.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p class="hint">The code is never shown on this page: it arrives only in your wallet's encrypted memo inbox.</p></div>
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
  if(s.stage==="sent"&&s.deliveryTxid){out.innerHTML="";out.appendChild(document.createTextNode("Check your wallet's memos. "));var a=document.createElement("a");a.href=s.explorer+s.deliveryTxid;a.textContent="Delivery on the explorer";a.rel="noreferrer";out.appendChild(a);}
  if(s.stage==="refunding"){out.className="outcome bad";out.textContent="Refund on its way: "+(s.reasonText||"");}
  if(s.stage==="refunded"){out.className="outcome bad";out.textContent="Refunded: "+(s.reasonText||"")+". ";if(s.refundTxid){var r=document.createElement("a");r.href=s.explorer+s.refundTxid;r.textContent="Refund on the explorer";r.rel="noreferrer";out.appendChild(r);}}
  if(s.stage==="expired"){out.className="outcome bad";out.textContent="This quote expired. Start a new order.";}
  if(s.stage==="held"){out.className="outcome bad";out.textContent="Payment held for review: "+(s.reasonText||"");}
}
function terminal(st){return ["sent","refunded","expired","held"].indexOf(st)>=0;}
function poll(){fetch("/api/o/"+id,{cache:"no-store"}).then(function(r){return r.json()}).then(function(n){s=n;render(s);if(!terminal(s.stage))setTimeout(poll,3000);}).catch(function(){setTimeout(poll,5000)});}
function tick(){var el=document.getElementById("countdown");if(!el)return;var ms=expiresAt-Date.now();if(s.stage!=="waiting"){el.textContent="";return;}if(ms<=0){el.textContent="This quote has expired.";return;}var m=Math.floor(ms/60000),sec=Math.floor(ms%60000/1000);el.textContent="Pay within "+m+":"+(sec<10?"0":"")+sec;}
document.querySelectorAll("[data-copy]").forEach(function(b){b.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){var t=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=t},1200)})})});
render(s); tick(); setInterval(tick,1000); if(!terminal(s.stage)) setTimeout(poll,3000);
})();
</script>`,
  );
}

export interface DashboardData {
  now: number;
  spendUsd: number;
  maxOrderUsd: number;
  maxDailyUsd: number;
  dailyCapIncludesTest: boolean;
  kv: Record<string, { v: string; updated_at: number } | undefined>;
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

function table(rows: Array<Record<string, unknown>>, cols: Array<[string, (r: Record<string, unknown>) => string]>): string {
  if (rows.length === 0) return `<p class="hint">none</p>`;
  return `<div style="overflow-x:auto"><table><thead><tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map(([, f]) => `<td>${f(r)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function dashboardPage(d: DashboardData): string {
  const tx = (id: unknown) => (typeof id === "string" && id ? `<a href="${esc(d.explorer + id)}" rel="noreferrer">${esc(id.slice(0, 10))}…</a>` : "");
  const mask = (ua: unknown) => (typeof ua === "string" && ua ? `${esc(ua.slice(0, 8))}…` : "");
  const t = (v: unknown) => esc(typeof v === "number" ? ist(v) : "");
  const s = (v: unknown) => esc(v === null || v === undefined ? "" : String(v));
  const wallet = d.kv.wallet_balance ? (JSON.parse(d.kv.wallet_balance.v) as { spendableZat: number; totalZat: number }) : null;
  const br = d.kv.bitrefill_balance ? (JSON.parse(d.kv.bitrefill_balance.v) as { balance?: number | string; currency?: string }) : null;
  const lastTick = d.kv.last_tick_at ? Number(d.kv.last_tick_at.v) : null;
  const stat = (label: string, value: string) => `<div class="card" style="margin:0"><div class="hint">${esc(label)}</div><div style="font-weight:700">${value}</div></div>`;
  return layout(
    "Chupke dashboard",
    `<style>main{max-width:1100px}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;white-space:nowrap}th{color:var(--muted);font-weight:600}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}</style>
<meta http-equiv="refresh" content="10">
<h1>Dashboard</h1><p class="lead">Addresses are masked to 8 characters. Redemption codes are never stored, so they can't be shown.</p>
<div class="stats">
${stat("Today's spend (IST)", `$${d.spendUsd.toFixed(2)} of $${d.maxDailyUsd}${d.dailyCapIncludesTest ? "" : " (real products)"}`)}
${stat("Per-order cap", `$${d.maxOrderUsd}`)}
${stat("Shop wallet", wallet ? `${(wallet.spendableZat / 1e8).toFixed(4)} TAZ spendable / ${(wallet.totalZat / 1e8).toFixed(4)} total` : "?")}
${stat("Bitrefill balance", br ? `${esc(String(br.balance ?? "?"))} ${esc(br.currency ?? "")}` : "?")}
${stat("Chain height", esc(d.kv.chain_height?.v ?? "?"))}
${stat("Last tick", lastTick ? `${Math.round((d.now - lastTick) / 1000)} s ago` : "never")}
</div>
<h2>Orders</h2>${table(d.orders, [
      ["id", (r) => `<a href="/o/${esc(String(r.id))}">${esc(String(r.id))}</a>`],
      ["sku", (r) => s(r.sku)],
      ["status", (r) => s(r.status)],
      ["$", (r) => s(r.value_usd)],
      ["zat", (r) => s(r.price_zat)],
      ["reply", (r) => mask(r.reply_ua)],
      ["created (IST)", (r) => t(r.created_at)],
    ])}
<h2>Payments</h2>${table(d.payments, [
      ["txid", (r) => tx(r.txid)],
      ["order", (r) => s(r.order_id)],
      ["zat", (r) => s(r.amount_zat)],
      ["state", (r) => s(r.state)],
      ["reason", (r) => s(r.reason)],
      ["conf", (r) => s(r.confirmations)],
      ["reply", (r) => mask(r.reply_ua)],
      ["refund", (r) => tx(r.refund_txid)],
      ["seen (IST)", (r) => t(r.first_seen_at)],
    ])}
<h2>Fulfillments</h2>${table(d.fulfillments, [
      ["order", (r) => s(r.order_id)],
      ["state", (r) => s(r.state)],
      ["invoice", (r) => s(r.invoice_id)],
      ["invoice status", (r) => s(r.invoice_status)],
      ["delivery", (r) => tx(r.delivery_txid)],
      ["error", (r) => s(r.error)],
      ["attempts", (r) => s(r.attempts)],
      ["updated (IST)", (r) => t(r.updated_at)],
    ])}
<h2>Events</h2>${table(d.events as unknown as Array<Record<string, unknown>>, [
      ["at (IST)", (r) => t(r.at)],
      ["type", (r) => s(r.type)],
      ["order", (r) => s(r.order_id)],
      ["detail", (r) => s(r.detail)],
    ])}`,
  );
}

export function notFoundPage(): string {
  return layout("Not found — Chupke", `<h1>Not found</h1><p><a href="/">Back to Chupke</a></p>`);
}
