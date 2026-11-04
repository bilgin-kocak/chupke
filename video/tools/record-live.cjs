// Records the live Chupke site for the demo video (1920x1080 webm in video/capture/):
//   landing.webm   a slow tour of the landing page
//   order-ok.webm  a Test gift card order: typed, paid from the CLI buyer wallet, watched until the code is sent
//   order-fail.webm the "always fails" card: paid, watched until the automatic refund
// Real orders on the live shop, paid with testnet coins. QR codes, memos and the reply address are blurred
// (they hold wallet addresses). Payment txids go to capture/payments.log.
//
//   node tools/record-live.cjs <base url> <reply address file>
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || "https://chupke-production.up.railway.app";
const REPLY = fs.readFileSync(process.argv[3], "utf8").trim();
const OUT = path.join(__dirname, "..", "capture");
fs.mkdirSync(OUT, { recursive: true });
const BLUR = "#reply, .qr svg, #memo { filter: blur(7px) !important; }";
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

function pay(orderId) {
  return new Promise((resolve) => {
    const p = spawn("npm", ["run", "-s", "buyer:pay", "--", "--order", orderId, "--base", BASE], {
      cwd: path.join(__dirname, "..", ".."),
      env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_OPTIONS: "--disable-warning=UNDICI-EHPA" },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      fs.appendFileSync(path.join(OUT, "payments.log"), `--- ${orderId} exit ${code}\n${out}\n`);
      resolve({ code, out });
    });
  });
}

async function newCtx(browser, name) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: path.join(OUT, `tmp-${name}`), size: { width: 1920, height: 1080 } },
  });
  return ctx;
}

async function saveVideo(ctx, page, name) {
  const v = page.video();
  await ctx.close();
  const src = await v.path();
  fs.renameSync(src, path.join(OUT, `${name}.webm`));
  fs.rmSync(path.dirname(src), { recursive: true, force: true });
  log(`saved ${name}.webm`);
}

async function landingTour(browser) {
  const ctx = await newCtx(browser, "landing");
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  for (const [sel, hold] of [["#how", 3500], ["#features", 3500], ["#privacy", 4500], ["#shop", 3500], ["#tech", 3500], ["#faq", 2500]]) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: "smooth", block: "start" }), sel);
    await page.waitForTimeout(hold);
  }
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  await page.waitForTimeout(3000);
  await saveVideo(ctx, page, "landing");
}

async function order(browser, sku, name, until) {
  const ctx = await newCtx(browser, name);
  const page = await ctx.newPage();
  await page.goto(BASE + "/#shop", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: BLUR });
  await page.waitForTimeout(1200);
  await page.click(`label.product:has(input[value="${sku}"])`);
  await page.waitForTimeout(700);
  await page.click("#reply");
  await page.keyboard.type(REPLY, { delay: 12 });
  await page.waitForTimeout(700);
  await Promise.all([page.waitForURL(/\/o\/[0-9A-Z]{10}$/), page.click('button[type="submit"]')]);
  await page.addStyleTag({ content: BLUR });
  const id = page.url().split("/o/")[1];
  log(`${name}: order ${id}`);
  return { ctx, page, id, name, until };
}

async function watch(o, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const txt = (await o.page.textContent("#outcome").catch(() => "")) || "";
    if (o.until.test(txt)) break;
    if (Date.now() - t0 > timeoutMs) {
      log(`${o.name}: timed out waiting (${txt.slice(0, 60)})`);
      break;
    }
    await o.page.waitForTimeout(1000);
  }
  await o.page.waitForTimeout(4000);
  log(`${o.name}: done after ${Math.round((Date.now() - t0) / 1000)} s`);
  await saveVideo(o.ctx, o.page, o.name);
}

(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const mode = process.argv[4] || "all";
  if (mode === "all" || mode === "landing") await landingTour(browser);
  if (mode === "all" || mode === "orders") {
    const ok = await order(browser, "test-ok", "order-ok", /Check your wallet's memos/);
    const fail = await order(browser, "test-fail", "order-fail", /^Refunded:/);
    fs.writeFileSync(path.join(OUT, "orders.json"), JSON.stringify({ ok: ok.id, fail: fail.id }));
    const watchers = [watch(ok, 6 * 60_000), watch(fail, 8 * 60_000)];
    for (const o of [ok, fail]) {
      const r = await pay(o.id);
      log(`${o.name}: buyer:pay exit ${r.code}`);
      if (r.code !== 0) log(r.out.slice(-300));
    }
    await Promise.all(watchers);
  }
  await browser.close();
})();
