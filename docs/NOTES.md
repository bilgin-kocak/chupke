# Engineering notes

## Environment (Claude Code cloud sandbox, M0)

- All outbound 443 traffic is TLS-re-terminated by an egress gateway with its own CA
  (`/root/.ccr/ca-bundle.crt`). Even "direct" connections are intercepted. gRPC (HTTP/2 with trailers) to
  `testnet.zec.rocks:443` works, both unary and streaming. WebSockets and non-443 ports are not
  supported, so the Nym mixnet can't run here.
- Tools that ship their own root store need that CA: zingo-cli (patched, see WALLET.md) and zingolib's
  build script (Sapling params pre-fetched).
- Node's built-in `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21). The
  Bitrefill npm scripts set it so requests go through the agent proxy. That proxy is where a
  Claude Code *network secret* attaches `Authorization: Bearer …` for `api.bitrefill.com`, so the key
  never enters the VM. `BitrefillClient` only sends its own header when `BITREFILL_API_KEY` is set,
  which is the VM/production case.
- The VM pauses when idle and can be reclaimed, and `data/` is not in git. Wallet seeds are saved to
  `data/wallets/<name>/RECOVERY.txt` (0600) for the owner to back up. Restore with `ZINGO_SEED` plus
  `--birthday` through `ZingoWallet.initWallet({seed, birthday})`.
- `testnet.zcashexplorer.app` returns 403 to the sandbox egress. Explorer links are for humans; the
  worker never needs them.

## Decisions (M0)

- **D1** zingolib pinned at `3f2529e` and built `nakednet-test-mode`, so there is a direct lightwalletd path
  and Nym is a stretch goal (tried on the VM in M3).
- **D2** Opt-in extra trust root patch, `ZINGO_EXTRA_CA_FILE`, set only in the sandbox.
- **D3** The Bitrefill key is a network secret in the sandbox and an env var on the VM worker only.
- **D4** Shop and buyer are zingo-cli wallets in separate data dirs. Each process uses one per-dir
  mutex and a cross-process lock file, so two zingo-cli processes never share a wallet directory.
- **D5** SPEC.md stays verbatim in its first commit. Verification results are added later as notes.
- **D6** (14:50 IST) The real-product purchase is skipped. The shop's Bitrefill balance is 0 and no source confirms
  event credits. Google Play India ₹100 stays allowlisted as a `kind: "real"` entry that the guard refuses while
  `ALLOW_REAL_PURCHASES=false`. That keeps the real-product path visible, and refused, in the demo.

## M1 end-to-end run (Wed 4 Nov 2026, IST)

I ran the worker and web locally (`npm run worker`, `npm run web`), created a `test-ok` order through
`POST /orders` with the buyer wallet's UA as the reply address, then ran
`npm run buyer:pay -- --order YMXHFE23J6`, which reads the ZIP 321 link from the order page.
There was no manual step after the payment. The event trail (from the `events` table, IST):

| time | event | detail |
| --- | --- | --- |
| 13:31:02 | order_created | test-ok, 1,000,000 zat (0.01 TAZ) |
| 13:31:02 | (buyer pays) | txid `8324da93e32da346653d98c72904a720ed3eb3470931ccac0ac49ebbd17c902d` |
| 13:31:15 | payment_seen | in the mempool, 0 conf |
| 13:32:25 | payment_confirmed | 1 conf at height 4581381 |
| 13:32:25 | accepted | guard passed |
| 13:32:26 | invoice_created → paying → paid → delivered | Bitrefill invoice `0dbb77e0-3573-48bd-abd1-39a6e57b5caf`, all inside one tick |
| 13:32:32 | memo_sent | delivery txid `433da69605a37eec4f9a72ab678602aa5a7f59bd80ca590374b0808d0ba0f576` |

- `npm run buyer:inbox -- --order YMXHFE23J6` showed the memo `Chupke #YMXHFE23J6 delivered` /
  `Test gift card` / `Code: 37…24 (16 chars)` (masked) arriving in the buyer wallet.
- It took about 94 s from payment to code sent; most of that was waiting for one block.
- Leak scan of `data/logs/worker.log`, `data/logs/web.log` and every `events.detail`: 0 hits for either UA,
  `CHUPKE1`, `Code:` and `utest1`.
- A tick takes about 6 s, dominated by `--waitsync` (about 2 s) and three zingo-cli reads of about 1 s each.

## M2 live refunds, restart and rescan (Wed 4 Nov 2026, 13:37–13:50 IST)

`scripts/refund-suite.sh YMXHFE23J6` drove real testnet payments from the CLI buyer wallet. The worker ran with
`GRACE_MIN=1`, and a second web on :8081 had `ORDER_TTL_MIN=1` for the expiry case. Every refund went to the
reply address in the paid memo, and the buyer wallet received each memo with its reason:

| case | order | payment txid | reason (memo text) | refund txid |
| --- | --- | --- | --- | --- |
| underpaid (0.005 of 0.01) | SQMXQ5C4Q6 | `24ad3c91c6f14ef64a815ba375172036110182c833041f853e0735473633d6a0` | underpaid ("Payment was less than the price") | `f2a9b0a85a7331e881cb879b77fccee7a3686594875759a7aac2f97a3eb9e04d` |
| over the per-order cap ($20) | N3RVZ44M5G | `6f95a052ee4135961e0bb22faefe319d2924441444060a5002d0ebd77795f5e3` | over_order_cap ("Over the per-order limit") | `a1bbe272901868c7824886963cd9c3d4acb2aa6d641efd23ef53f7287cea8932` |
| failing Bitrefill product | KXYYT4NGG8 | `2277378b2eb83d2a7341e3ac8f26cbf3c3ce331f88233ac5dba5d5828865a128` | bitrefill_order_failed ("The purchase failed; nothing was bought.") | `4c9f9879779c53887ac0d6a9002878f48cec9413175796edfdff78d817d1eb79` |
| duplicate payment | YMXHFE23J6 | `5ec26ab4e9a20e10d4d7b50db58dc1a2f171a1e939b07d0b6e1e4fcc5032024e` | duplicate_payment ("This order was already paid"), plus a `duplicate_skipped` event | `34f0a31ac141357661471ddc9111bcedf2cdd076b50e59792f0b05dcad1a92d8` |
| late payment, expired quote | CVTJ3622GM | `4baa29499b49b9e832a9e69e8f8e4a58fc309668359e221faeaddc0b9eb49d5e` | quote_expired ("The price quote expired") | `4e45c0c2a676c5e516ba21352d2ac08a90c2a206c3efdec2330faa75488413cb` |

Every refund returns the full amount, and the shop pays the network fee from its float. Explorer links take the
form `https://testnet.zcashexplorer.app/transactions/<txid>`.

**Bug found live:**
- The failing product's invoice ended at `all_error`, and its order at `permanent_failure`. Neither is a
  documented state, so the worker kept polling.
- Fixed in commit "Treat Bitrefill's live failure states as failures". On restart the worker resumed
  KXYYT4NGG8 from `paid`, recognized the failure, and refunded it.

**Graceful stop:** SIGTERM arrived in the middle of a tick that was sending a refund. The worker logged
"stopping after the current tick", finished the tick (11.9 s), and exited 0.

**Restart with a full rescan:**
1. Stopped the worker.
2. Ran `npx tsx scripts/rescan.ts`. For both shop and inbox this is `clear` followed by a re-sync from the
   birthday, about 4 s each. Both then listed 8 received outputs.
3. Restarted the worker in `WALLET_MODE=split`.
4. Result: the only new event was `restart_ingest: 6 known output(s) seen again and skipped (INSERT OR IGNORE), 0 new`.
   Payments stayed at 6, fulfillments at 2 and Bitrefill invoices at 2, and wallet sends stayed at 6. So there
   was no new purchase and nothing sent again.

**Split mode end to end:**
- Order 3J5T3XDWPH: the view-only inbox saw the payment `fe66b880ceceaba77e3dfedd26a7ad46d28282136358782433503e9f23124293`.
- The full outbox bought Bitrefill invoice `122d00de-a049-4acc-b735-23ef85b0dcfb` and sent the delivery memo
  `6b8d1f3f8ccf9990040d7ae18ed6a9daf6e41e6bd6b1764ab57f674c5f555f7d`.
- The code arrived in the buyer wallet.

**429 handling and crash paths:**
- Tests cover these (test/client.test.ts and test/engine.test.ts, 73 tests in all): Retry-After retries on GETs,
  no retry on pay or invoice creation, and crashes after create, during paying, and in refund_sending.
- A 429 wasn't provoked live, to stay well inside Bitrefill's limits.

## Adapter rules as built (src/zcash/zingo.ts)

- One zingo-cli process per call, serialized per data dir, with a 120 s timeout (SIGTERM, then SIGKILL).
- Local reads run `--offline`. `sync()` is `--waitsync height`. `send()` is `--waitsync quicksend <json>`,
  which syncs first so the proposal uses fresh anchors.
- Logs contain only `{cmd, exitCode, ms, timedOut}`. On failure the thrown error carries only the
  `Error:`/`caused by` lines from stderr, scrubbed of addresses and keys and capped at 300 chars.
- `ZINGO_SEED` and `RUST_LOG` are removed from the child environment unless a restore passes the seed explicitly.
