Build "Chupke" (Hindi: "quietly") for the Free Society Hack (Zcash x Bitrefill), Mumbai, today Wed 4 Nov 2026 (IST). Finalize by 20:00 IST; code freeze 23:45 IST; code after 00:00 isn't scored.

FIRST: save this whole prompt as SPEC.md in the repo root, create .gitignore (.env, data/, wallets/, node_modules/, *.db), and commit. Then do Milestone 0 ONLY (section 12) and STOP to report. Don't start M1 until I say go.

1. WHAT IT IS
Pitch (judges score "Works" against it; every clause must be real in the demo): "Pay shielded ZEC from your Zcash wallet and get a gift card code delivered to your encrypted memo inbox: no account, no email, automatic refund if anything fails, never charged twice."
Flow:
- The buyer picks a product on the Chupke page and pastes a fresh shielded reply address (utest1...).
- The page shows a ZIP 321 QR: shop address, TAZ price, memo "CHUPKE1 o=<orderId> r=<replyUA>".
- The buyer pays from a testnet wallet.
- The worker sees the payment, waits for confirmation, runs the guard, buys on Bitrefill from the shop's own balance, and waits until it's delivered.
- The worker sends the code to the reply address in a shielded memo. The page never shows the code.
- On any failure, the worker sends a shielded refund with the reason in the memo.
Framing (README/video): the buyer's ZEC pays Chupke; Chupke pays Bitrefill from its own balance (event credits today; in production, ZEC revenue converted to USDC in batches). Never claim Bitrefill accepted ZEC.
Tracks: entering both.
- Privacy (Zcash): ZIP 321 checkout, viewing-key watcher, shielded delivery and refunds, privacy design.
- Agentic Commerce (Bitrefill, Lane 5 "Private by default"): an autonomous, guarded purchasing worker on REST v2, with failure handling and exactly-once purchases.
Not doing: mainnet, real ZEC, swaps, phone top-ups, LLM, accounts, email, partial refunds, carts.

2. RULES - NEVER BREAK
- No mocks outside test/. The running app makes real testnet transactions and real Bitrefill calls.
- Never log, print, commit or echo: the Bitrefill API key, wallet seed, UFVK, redemption codes/PINs/links, reply addresses, or memo contents. Use pino redaction.
- Never do a real (non-test) Bitrefill purchase without my explicit go-ahead. Keep ALLOW_REAL_PURCHASES=false until then.
- Never retry a money-moving call blindly (Bitrefill pay, wallet send). Persist state first; on resume, check status first.
- Zcash:
  - Testnet with NU7 only: shielded unified addresses (utest1...), light-wallet server https://testnet.zec.rocks:443.
  - Out of scope: zcashd wallet RPC, mainnet, Sprout, v4 transactions, Zcash Shielded Assets.
  - Ironwood is the active shielded pool (Orchard has been sealed since NU6.3), so ignore old Orchard/Sprout tutorials.
  - Let the wallet compute fees (ZIP 317).
- Bitrefill: all code is written today. Commit small and often, because commit history is checked. Redeem codes only into my own accounts.
- The web process holds no secrets. Never run two zingo-cli processes on the same wallet directory.
- Log friction as you go: every Bitrefill friction point goes in FEEDBACK.md (dated: what you tried, what happened, what you expected); Zcash tooling findings go in docs/WALLET.md.
- When you need me (funding wallets, Bitrefill credits, picking the real product, deploying), give numbered steps and wait.
- Facts marked VERIFY are unconfirmed. Check them against the live system and update SPEC.md.

3. ARCHITECTURE
Two processes plus one SQLite file (WAL mode):
- web: public, holds no secrets. Order pages, QR, status, dashboard.
- worker: not internet-facing. Holds the wallet, the Bitrefill key and the state machine; writes balance/height snapshots to a kv table.
Stack: Node 22, TypeScript strict, tsx, Hono (server-rendered HTML, no third-party scripts/fonts/CDNs), better-sqlite3, zod, pino, qrcode (server-side SVG), vitest. Zcash via a zingo-cli subprocess behind an adapter.
Layout:
- src/: config.ts, log.ts, ids.ts, db/, worker.ts
  - zcash/: wallet.ts, zingo.ts, memo.ts, zip321.ts, address.ts
  - bitrefill/: client.ts, limiter.ts, redemption.ts
  - engine/: guard.ts, route.ts, fulfill.ts, refund.ts, tick.ts
  - web/: server.ts, views.ts, qr.ts
- scripts/: wallet-smoke.ts, bitrefill-smoke.ts, bitrefill-buy-once.ts, find-products.ts, buyer-pay.ts, evidence.ts
- test/, docs/ (WALLET.md, NOTES.md), config/allowlist.json, Dockerfile, docker-compose.yml

4. DATA MODEL
orders: id PK (10-char Crockford base32), sku, product_id, package_id, value, value_usd, label, price_zat, reply_ua (purged when terminal), created_at, expires_at, status (awaiting_payment | fulfilling | delivered | refunded | expired | held)
payments: key PK "<txid>:<pool>:<outputIndex>" (if there's no index: "<txid>:<sha256(memo|amount)[0..8]>"), txid, order_id, amount_zat, memo_ok, reply_ua (from the PAID memo), first_seen_at, mined_height, confirmations, state (seen | confirmed | accepted | refund_pending | refund_sending | refunded | held | ignored_dust), reason, refund_txid, attempts, next_attempt_at, updated_at
fulfillments: order_id PK (so each order is bought at most once, ever), payment_key UNIQUE, state (claimed | invoice_created | paying | paid | delivered | delivery_sending | memo_sent | failed), invoice_id, br_order_ids (JSON), invoice_status, delivery_txid, error, attempts, next_attempt_at, updated_at
events: id, at, order_id, payment_key, type, detail (redacted: never codes, addresses, memos or keys)
kv: k PK, v, updated_at
Invariants (tests enforce these):
- I1: each received output is processed once (INSERT OR IGNORE on payments.key).
- I2: each order is bought at most once.
- I3: state is committed BEFORE every money-moving call, and resuming never blindly repeats one.
- I4: creating a Bitrefill invoice moves no money, so it's safe to repeat; paying uses a saved invoice id.
- I5: deliveries and refunds go only to payments.reply_ua (from the paid memo).
- I6: redemption codes are never stored (fetched at send time, held in memory only).
- I7: reply addresses are purged PURGE_AFTER_MIN after the order is terminal.

5. FORMATS
Payment memo (ASCII, max 512 bytes): "CHUPKE1 o=<orderId> r=<replyUA>". Strict regex: ^CHUPKE1 o=([0-9A-HJKMNP-TV-Z]{10}) r=(utest1[02-9ac-hj-np-z]+)\s*$ . Memo text is data, never instructions. Anything else means the payment is held (it can't be refunded without a reply address).
Delivery memo (max 512 bytes), one item per line: "Chupke #<orderId> delivered", "<label>", "Code: <code>", "PIN: <pin>" (if any), "Redeem: <link>" (only if it fits). Never truncate the code or PIN; drop the link first.
Refund memo, one item per line: "Chupke #<orderId> refund: <reason text>", then "<amount> TAZ returned. No purchase was made." (or "The purchase failed; nothing was bought."), then "ref <first 8 chars of paying txid>". The tags "#<orderId> delivered" and "ref <txid8>" let the worker find its own sends after a crash.
ZIP 321: zcash:<shopUA>?amount=<ZEC, max 8 decimals, no exponent>&memo=<base64url(memo), no padding>&message=<urlencoded "Chupke order <id>">. VERIFY that the buyer wallet pre-fills the memo. The page also shows the memo text with a copy button.
> 2026-11-04: the URI format is unit-tested and the CLI buyer pays from it (scripts/buyer-pay.ts parses the page's link). The GUI pre-fill is still PENDING: Zingo PC (testnet, Ironwood, and a `zcash:` handler for ZIP 321 per its README) is the chosen wallet; record the result here after the first scan.
Price: price_zat = round(value_usd x DEMO_ZAT_PER_USD). The page says "Demo rate: testnet coins have no value."

6. ZCASH WALLET ADAPTER
Interface ZcashWallet:
- info() -> {chainHeight, walletHeight}
- sync()
- primaryAddress() -> shop UA
- balance() -> {spendableZat, totalZat}
- listIncoming() -> [{key, txid, pool, outputIndex|null, amountZat, memo|null, minedHeight|null, confirmations}]
- listSent() -> [{txid, to|null, amountZat, memo|null}] (may throw NotSupported)
- send(to, amountZat, memo) -> {txid}
WALLET_MODE:
- single: one full wallet. Start here.
- split (stretch): the inbox is a view-only wallet from the shop UFVK (used for listIncoming); the outbox is a full wallet of the same account (used for send and listSent).
zingo-cli, known from its README:
- Build in the zingolib workspace with "cargo build --release -p zingo-cli".
- Flags: --chain testnet, --server https://testnet.zec.rocks:443, --data-dir <one dir per wallet>, --waitsync, --nosync.
- One-shot mode: "zingo-cli [flags] <command> [args]" runs and exits (exit 0 = ok, logs on stderr).
- Restore: ZINGO_SEED env (preferred) or --seed, plus --birthday <H>. View-only: --viewkey <UFVK> --birthday <H>.
- Documented commands: addresses, balance, info, send <address> <zatoshis> "memo", help, help <command>.
- Nym (stretch): build nym-proxy with "cargo build --release --manifest-path zingo-netutils/Cargo.toml --features nym --bin nym-proxy", then pass --nym-proxy <path> or set ZINGO_NYM_PROXY.
VERIFY in M0 using help and real runs, and record in docs/WALLET.md:
1. Which command lists received notes WITH memos, and whether it outputs JSON.
2. Whether send needs a follow-up confirm (or whether quicksend exists), and how to get the txid.
3. How to export the UFVK and get the chain height.
4. How many confirmations received notes need before they're spendable.
5. That a send to a utest1 address is accepted on NU7 testnet and shows on https://testnet.zcashexplorer.app/transactions/<txid>.
> VERIFIED in M0 (2026-11-04; zingo-cli 0.5.0 at zingolib 3f2529e; details in docs/WALLET.md):
> 1. `notes all` prints JSON for each received output (txid, output_index, value, memo, status). `messages` prints JSON for memo-bearing value transfers, both sent and received.
> 2. `send` only proposes, and the proposal holds sync until `confirm` or `decline`. `quicksend` combines both and prints JSON `{"txids":[...]}`.
> 3. `export_ufvk` prints JSON `{ufvk, birthday}`. The chain height comes from `info` (`latest_block_height`); the wallet's last-seen height comes from `height`.
> 4. The wallet default is min_confirmations = 3 (change it with `settings min_confirmations <n>`).
> 5. Yes. buyer→shop `efe4efd400c39d6d46464c6c238e0aa156081153b97e7f36c9717ede0fc6bae7` was mined at 4581272, with the CHUPKE1 memo byte-exact. shop→buyer `32ba681f33e57a8ebb32ca3a14b0bc4de26c4c2e9845c2f40acb2c1d5d6c091d` (1,000 zat plus a memo) was mined at 4581277. Both landed in the Ironwood pool. The fee was 10,000 zat (ZIP 317), and a 1,000-zat output was accepted. testnet.zcashexplorer.app returns 403 to the sandbox, so mining was confirmed with lightwalletd GetTransaction (scripts/tx-status.ts); the explorer links are for a browser.
> Corrections to the README facts above:
> - The default build sends every transaction over the Nym mixnet and fails closed, and a build without `nym` is offline-only. Chupke therefore builds with `--no-default-features --features nakednet-test-mode` (scripts/build-zingo.sh).
> - Sessions are offline-first; `--server` implies online consent.
> - Wallets must be created with `--waitsync`, or later `--waitsync` calls never return.
> - nym-proxy is now a workspace member, so the `--manifest-path zingo-netutils/Cargo.toml` command is stale.
> - The UA has one orchard-type receiver; balances and notes report an `ironwood` pool.
Adapter rules: serialize calls per data dir (async mutex); 120 s timeout; parse stdout defensively with zod; never log raw stdout (log the command name, exit code and duration only). Wallet birthday = current height - 100.
Fallback, only if zingo-cli fails: zcash-devtool.
- "cargo run --release --all-features -- wallet -w <dir> init --name N -i key.txt -n test -s zecrocks"
- init-fvk, sync -s zecrocks, balance, list-addresses
- Memo sends go through pczt: create --memo, then prove, sign, combine, send.
Wallets:
- shop: receives payments and sends deliveries/refunds. Keep a float of at least 0.2 TAZ for fees.
- buyer: the demo payer. Use a separate data dir plus scripts/buyer-pay.ts, or a GUI testnet wallet I'll pick.
Faucets: Fauzec (1 TAZ/day/address), Valar, Jino Labs. Mentors can send more.

7. BITREFILL REST V2
Base URL https://api.bitrefill.com/v2 (their OpenAPI shows api-bitrefill.com; VERIFY with /ping). Header "Authorization: Bearer <BITREFILL_API_KEY>".
> VERIFIED 2026-11-04: both hosts answer GET /v2/ping (401 `no_token` without a key). We use https://api.bitrefill.com/v2, as the Quickstart does. With the key (attached by the sandbox proxy as a network secret), ping returns `pong`.
> - The balance came back as `{"balance":0,"currency":"BTC"}`. Prices are integer sats, about 1344 per USD.
> - Test products are visible with `include_test_products=true`; nothing had to be enabled.
> - Package ids are opaque strings like `test-gift-card-code<&>10`. test-gift-card-code is ranged 10–100 USD in steps of 10, so the smallest test order is $10.
> - The test-ok buy ran create, pay (200), poll and delivered in about 1.2 s (invoice ae97a250-38fc-4f3f-b238-3c96fecbad63).
> - Live statuses: the top-level invoice `status` is `not_delivered`/`all_delivered`, and `payment.status` goes unpaid → payment_confirmed → complete. The pay 200 body still showed `unpaid`.
> - `redemption_info` on GET /orders/{id} is an object (code, instructions). GET /invoices/{id} embeds it in every order; the client strips it.
Endpoints: GET /ping (1 req per 3 s), GET /accounts/balance, GET /products/search?q=, GET /products/{id} (with packages[]), POST /invoices, POST /invoices/{id}/pay, GET /invoices/{id}, GET /orders/{id}.
Create invoice: POST /invoices with
{"products":[{"product_id":"...","package_id":"<exact string from product details>","quantity":1}],"payment_method":"balance","auto_pay":false}
- For ranged products, send "value": <number> instead of package_id.
- Returns data.id, data.status, data.payment.status ("unpaid"), data.payment.price, data.orders[].id/status.
- A 400 returns {message, error_code}.
Pay: POST /invoices/{id}/pay returns 200 with the invoice; 404 = "not found or already paid"; 403 = not enough funds.
Statuses:
- Invoice: unpaid, payment_detected, payment_confirmed, pending, complete, blocked, denied, payment_error.
- Order: created, payment_detected, processing, delivered, failed, refunded.
- Done = every order is "delivered". An invoice marked "complete" alone isn't proof.
Redemption: GET /orders/{id} returns data.redemption_info. It's a string per the OpenAPI and an object {code, link, pin, instructions} per Bitrefill's skill, so normalize both.
Limits: invoices expire after 180 min and hold at most 20 products. Rate limits are 60 req per 10 min for most endpoints; /products and /products/search allow 60 per min (plus 1000 product requests per hour).
Client behavior:
- Sliding-window limiter: at most 55 non-product requests per 10 min.
- On a 429, honor Retry-After; otherwise back off 5/10/20/60 s with jitter, and write a rate_limited event.
- Poll invoices at most every 8 s.
Test products:
- test-gift-card-code always succeeds; test-gift-card-code-fail always fails.
- They're hidden unless you pass include_test_products=true, and they're free with payment_method=balance.
- Bitrefill may need to enable them on my key. If they're unavailable, show failures with an invalid package (400) and with guard refunds.
Reference: https://docs.bitrefill.com/llms.txt (append .md to any docs page). Trust live responses over docs.

8. ENGINE (worker loop every TICK_MS=10000)
Each tick, in order:
1. Sync the wallet.
2. Ingest listIncoming (INSERT OR IGNORE; refresh confirmations).
3. Move payments from seen to confirmed once confirmations >= MIN_CONFIRMATIONS.
4. Route each confirmed payment (one DB transaction each).
5. Advance due fulfillments.
6. Process due refunds.
7. Expire unpaid orders past expires_at + GRACE_MIN.
8. Write kv: bitrefill_balance, wallet_balance, chain_height, last_tick_at.
9. Purge reply_ua from old terminal orders.
route(p), checked in this order:
1. amount < DUST_ZAT -> ignored_dust.
2. Memo unparseable -> held("no_reply_address").
3. Order missing -> refund_pending("unknown_order").
4. Order already has a fulfillment -> refund_pending("duplicate_payment"), plus a duplicate_skipped event.
5. first_seen_at > expires_at + GRACE_MIN -> refund_pending("quote_expired").
6. Guard rejects -> refund_pending(reason).
7. Otherwise: insert fulfillment "claimed", set the payment "accepted" and the order "fulfilling".
advance(f), by fulfillment state:
- claimed: call createInvoice.
  - 200: save invoice_id and order ids -> invoice_created.
  - 400: failed("bitrefill_rejected:<error_code>") and refund.
  - 429/5xx/network: back off and stay claimed. This is safe, because orphan invoices expire unpaid.
- invoice_created: COMMIT "paying" FIRST, then call payInvoice.
  - 200: paid.
  - 403: failed("shop_out_of_credit") and refund.
  - 404: call getInvoice. If payment.status is not unpaid -> paid; otherwise failed("invoice_not_payable") and refund.
  - network/429: stay paying and back off.
- paying (resume): call getInvoice FIRST. If unpaid, pay again; otherwise -> paid. Never create a new invoice here.
- paid: call getInvoice (at most every 8 s).
  - All orders delivered -> delivered.
  - Any order failed/refunded, or the invoice is blocked/denied/payment_error -> failed("bitrefill_order_failed") and refund.
- delivered:
  1. COMMIT "delivery_sending" first.
  2. Call getOrder and build the delivery memo.
  3. Call wallet.send(reply_ua, DELIVERY_AMOUNT_ZAT, memo) and save the txid.
  4. Set the fulfillment memo_sent and the order delivered.
- delivery_sending (resume): find "#<orderId> delivered" in listSent and save its txid. If it's not found, resend (a duplicate memo only costs a fee).
refund(p), by payment state:
- refund_pending:
  1. COMMIT refund_sending and increment attempts.
  2. Call wallet.send(p.reply_ua, p.amount_zat, refund memo); the shop pays the fee from its float.
  3. Set the payment refunded.
- refund_sending (resume): if listSent works, find "ref <txid8>"; if found -> refunded, otherwise resend. If listSent is NOT supported -> held("refund_needs_review"). Never resend money blindly.
Backoff: next_attempt_at = now + min(60 s, 5 s x 2^attempts) + jitter.

9. GUARD (pure function, table-tested)
Each rule maps to a reason code and the human text used in the refund memo:
- PAUSE_PURCHASES -> paused, "Shop is paused".
- amount < price -> underpaid, "Payment was less than the price".
- SKU not allowlisted or mismatched -> not_allowed, "Product not available".
- kind "real" while ALLOW_REAL_PURCHASES=false -> real_purchases_disabled, "Shop isn't selling this yet".
- value_usd > MAX_ORDER_USD -> over_order_cap, "Over the per-order limit".
- Today's spend (IST, counting fulfillments from "paying" onward) + value_usd > MAX_DAILY_USD -> over_daily_cap, "Shop's daily limit reached".
Defaults: MAX_ORDER_USD=10, MAX_DAILY_USD=30, MIN_CONFIRMATIONS=1, ORDER_TTL_MIN=20, GRACE_MIN=10.
README guardrails line: "Per order up to $10, per day up to $30 (IST). Above either limit nobody approves: the order is refused and refunded automatically. Only allowlisted products can be bought."
config/allowlist.json entry shape: {"sku":"test-ok","kind":"test","label":"Test gift card","product_id":"test-gift-card-code","package_id":"<from details>","value_usd":5}. Seed three entries: test-ok, test-fail (test-gift-card-code-fail), and one cheap real product I'll redeem myself. Fill in the IDs with scripts/find-products.ts.

10. WEB
- GET /: "Buy quietly." plus the pitch, product cards from the allowlist (label, face value, TAZ price), a reply-address input ("Paste a fresh shielded address from your wallet (starts with utest1). Your code or refund is sent here.") and a "Get payment QR" button.
- POST /orders: validate the SKU and address (prefix, charset, memo max 512 bytes), create the order, redirect to /o/:id.
- GET /o/:id:
  - SVG QR, an "Open in wallet" zcash: link with a copy button, the amount, "your wallet adds the network fee", an expiry countdown, and the exact memo text.
  - A live status timeline polling /api/o/:id every 3 s: waiting -> seen -> confirmed -> buying -> delivered -> sent to your wallet (explorer link), or refunded (reason and explorer link).
  - A 4-line "Who can see what" box.
  - Never shows the code.
- GET /api/o/:id: status JSON only (no address, no code).
- GET /dashboard (basic auth with DASHBOARD_PASSWORD): orders, payments and fulfillments (addresses masked to 8 chars, no codes), the events timeline, today's spend vs caps, and balances, height and last tick from kv.
- GET /healthz.
- One inline CSS block, mobile-friendly, no external assets.

11. ENV (.env.example)
Worker only: BITREFILL_API_KEY, BITREFILL_BASE_URL=https://api.bitrefill.com/v2, ALLOW_REAL_PURCHASES=false, ZINGO_CLI_PATH=./bin/zingo-cli, ZINGO_SEED, ZINGO_NYM_PROXY, WALLET_MODE=single, SHOP_WALLET_DIR=./data/wallets/shop, INBOX_WALLET_DIR=./data/wallets/inbox, SHOP_UFVK, WALLET_BIRTHDAY, LIGHTWALLETD_URL=https://testnet.zec.rocks:443, DELIVERY_AMOUNT_ZAT=1000 (raise it if tiny outputs are rejected), DUST_ZAT=20000, TICK_MS=10000.
Shared: DATABASE_PATH=./data/chupke.db, SHOP_UA, DEMO_ZAT_PER_USD=100000, MAX_ORDER_USD=10, MAX_DAILY_USD=30, MIN_CONFIRMATIONS=1, ORDER_TTL_MIN=20, GRACE_MIN=10, PURGE_AFTER_MIN=60, PAUSE_PURCHASES=false.
Web: PORT=8080, PUBLIC_BASE_URL, DASHBOARD_PASSWORD.

12. MILESTONES (IST)
M0 (now -> 13:30), then STOP and report:
- Scaffold package.json, tsconfig, .env.example, the src/zcash/wallet.ts interface and src/bitrefill/client.ts, and commit.
- Wallet:
  1. Build zingo-cli and write scripts/wallet-smoke.ts using the adapter.
  2. Create the shop and buyer testnet wallets, and tell me their addresses so I can fund them.
  3. Send buyer -> shop with a test memo, and check that the shop's listIncoming returns it.
  4. Send shop -> buyer with a memo, and check that the txid is visible on the explorer.
  5. Record exact commands and outputs in docs/WALLET.md.
- Bitrefill:
  1. scripts/bitrefill-smoke.ts: ping, balance, search, product details (including test products).
  2. scripts/bitrefill-buy-once.ts --sku test-ok: create -> save id -> pay -> poll -> delivered -> print the masked redemption.
  3. Buy the real product only after my go-ahead, and record its invoice ID.
  > 2026-11-04: SKIPPED by decision. The shop's Bitrefill balance is 0, and no public source says Bitrefill provides event credits. The real entry (google-play-india-100, $1.14, proposed by the MCP catalog) stays allowlisted and is refused with "Shop isn't selling this yet" while ALLOW_REAL_PURCHASES=false. All Bitrefill evidence uses the free test products.
- Gate:
  - Both rails work -> both tracks.
  - Only Bitrefill works -> Agentic-only (same engine, with a signed webhook trigger instead of Zcash).
  - Only Zcash works -> Privacy-only (deliver a signed digital receipt instead of a Bitrefill code).
M1 (-> 15:30): DB, ids, memo, zip321, guard plus tests, the engine (route/fulfill), the worker loop, and web /, /o/:id and /api/o/:id. Done = a real testnet payment for test-ok flows end to end, and the code arrives in the buyer wallet's memo with no manual step.
M2 (-> 17:00):
- Refunds for underpaid, expired, over cap, test-fail (or a Bitrefill 400) and duplicate payments.
- Restart/rescan safety, 429 handling, and the crash-recovery paths.
- Engine tests for every invariant.
- Split-wallet mode if the adapter supports view-only.
- Done = each refund lands on testnet with its reason, and restarting with a full rescan produces duplicate_skipped and no new purchase.
M3 (-> 18:30):
- Dashboard and the who-sees-what panel.
- Deploy to a public URL (a small VM with Docker and a persistent volume; a Cloudflare quick tunnel only as a fallback).
- scripts/evidence.ts: a markdown table of the latest payment, delivery and refund txids with explorer links, plus the Bitrefill invoice ID.
- Stretch, in this order:
  1. Split wallet.
  2. MCP catalog script: Bitrefill's hosted MCP search-products/get-product-details proposes allowlist entries that I approve (combining surfaces scores higher).
  3. Nym.
     > BUILT, NOT RUN 2026-11-04. `ZINGO_BUILD=nym` builds upstream's default zingo-cli plus nym-proxy (locally 4 + 6 min, no warnings), and CI publishes `ghcr.io/bilgin-kocak/chupke:nym`. Offline it reads the same wallet files as the nakednet build. Online, sends and price fetches go over the mixnet and sync stays direct; nothing falls back to a direct broadcast. This sandbox can't reach the mixnet: without nym-proxy the build refuses to go online at once ("Mixnet Mode is required for a connected session"), and with it zingo-cli restarted the proxy three times and was still waiting after 5 minutes. The adapter treats the refusal as a send that never ran (sendNeverRan). Not run against the mixnet.
  4. Overpayment refund.
     > DONE 2026-11-04. After a delivery, payment − price is returned when it is at least OVERPAY_REFUND_MIN_ZAT (20,000 zat); a smaller excess is kept. It is returned to the paid memo's reply address with the memo "Chupke #<order> overpayment: X TAZ returned. / You paid P TAZ; the price was Q TAZ. / ref <txid8>". It has its own committed state and a listSent resume check, and it is held for review if it can't look. Live: order VTQ8KA58D0 paid 0.015 for 0.01 TAZ; delivery fde411c8…, then 0.005 TAZ returned in 287e7afd27e258ed7e570a31d74d9cadd753a49a810289e886eda4a73729b532.
  5. Per-order diversified addresses.
     > DONE 2026-11-04. The worker keeps ADDRESS_POOL_SIZE (10) fresh addresses ready with `zingo-cli new_address o` (in split mode on the view-only inbox, which derives the same address at each index as the full wallet). The web claims the lowest free one per order, once (address_pool table, orders.pay_ua), and falls back to the primary UA when the pool is empty. Addresses derived by another shop wallet are never shown. Payments are still matched by memo, because zingo-cli 0.5.0 note summaries don't say which address a note was paid to. Live: order Y94QVCAHVB paid its own address (index 1) in 5204d07d…; the split inbox saw it at 0 conf, and the code was delivered in cc7c9429a396a1c979dedc54817d6b94740a7c2d940de69c2190f86d6d1fca8f.
M4 (-> 20:00): write README.md, PRIVACY.md and FEEDBACK.md (see section 14). I record the video and finalize on Stadium.

13. TESTS (vitest; fakes only here)
- memo: round-trip; the regex rejects junk; the 512-byte limit holds; the delivery memo never truncates the code or PIN; refund tags are present.
- zip321: base64url with no padding, amount formatting, URL encoding.
- guard: one test per reason code, plus a pass case.
- engine, with a fake wallet and a fake Bitrefill:
  1. The same note ingested twice -> one fulfillment.
  2. Two payments for one order -> one fulfills, the other is refunded as duplicate_payment.
  3. A crash after createInvoice but before the id is saved -> a new invoice, and exactly one pay.
  4. A crash in paying -> getInvoice first, and no second pay if it's already paid.
  5. Pay returns 404 while the invoice is paid -> paid.
  6. A failed Bitrefill order -> exactly one refund.
  7. A crash in refund_sending without listSent -> held, and no resend.
  8. Refunds use the memo's reply_ua, never the order's.
  9. No code or address appears in events.detail or logs (use a log spy).

14. DOCS FOR SUBMISSION (M4)
README.md must include:
- The one-line pitch, and which parts belong to which track.
- How it works (a diagram).
- The loop: trigger (shielded payment) -> guarantee (caps, exactly-once, refunds) -> fulfillment (Bitrefill) -> ending (code in an encrypted memo).
- The lane: Lane 5, plus Lane 1's guarantee and Lane 2's ending.
- How to run it in under 15 minutes: docker compose up --build (the first build compiles zingo-cli).
- Every technology used, and the design decisions.
- A Bitrefill touchpoints paragraph: REST v2, the MCP catalog if built, and Docs llms.txt used by the coding agent; what was built vs reused.
- The guardrails line from section 9.
- An evidence table: testnet txids with explorer links, plus the real Bitrefill invoice ID.
  > 2026-11-04: there is no real-product invoice (the purchase was skipped; see M0 Bitrefill step 3). The table lists the test-product invoice IDs instead.
- The demo video and the public URL.
- The merchant-of-record framing.
- The next milestone (30 days), with links: a Bitrefill partner/reseller pilot on mainnet with batched ZEC->USDC top-ups, Nym for wallet traffic, per-order diversified addresses, and the shielded checkout and refund module open-sourced.
PRIVACY.md answers four questions. Be honest: naming a gap costs nothing.
1. What stays private: on-chain, the sender, receiver, amount and memo of the payment, the delivery and the refund. The web server holds no keys, and codes are never stored.
2. What's revealed, and to whom:
   - The light-wallet server sees the worker's IP, its sync timing and which transactions it downloads (unless Nym is used).
   - The web server sees the buyer's IP and page visits, and the reply address until it's purged.
   - The operator sees the order, the amount and the reply address until it's purged.
   - Bitrefill sees that the shop bought product X, never the buyer's wallet.
3. What users must trust:
   - The operator holds the buyer's money between payment and delivery (this isn't trustless escrow), and can re-read delivered codes via its outgoing viewing key.
   - The hosted light-wallet server and Bitrefill.
   - A 1-confirmation depth in the demo.
4. What we'd fix next: Nym, a split view-only inbox, delivery memos without an outgoing viewing key, per-order diversified addresses, Nym/Tor-friendly order pages, and batched top-ups.
FEEDBACK.md: the dated Bitrefill friction log, cleaned up into "what worked" and "what didn't".

START NOW: save this as SPEC.md plus .gitignore, commit, then do M0 only and report.
