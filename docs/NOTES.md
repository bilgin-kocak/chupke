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

## Adapter rules as built (src/zcash/zingo.ts)

- One zingo-cli process per call, serialized per data dir, with a 120 s timeout (SIGTERM, then SIGKILL).
- Local reads run `--offline`. `sync()` is `--waitsync height`. `send()` is `--waitsync quicksend <json>`,
  which syncs first so the proposal uses fresh anchors.
- Logs contain only `{cmd, exitCode, ms, timedOut}`. On failure the thrown error carries only the
  `Error:`/`caused by` lines from stderr, scrubbed of addresses and keys and capped at 300 chars.
- `ZINGO_SEED` and `RUST_LOG` are removed from the child environment unless a restore passes the seed explicitly.
