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

## Adapter rules as built (src/zcash/zingo.ts)

- One zingo-cli process per call, serialized per data dir, with a 120 s timeout (SIGTERM, then SIGKILL).
- Local reads run `--offline`. `sync()` is `--waitsync height`. `send()` is `--waitsync quicksend <json>`,
  which syncs first so the proposal uses fresh anchors.
- Logs contain only `{cmd, exitCode, ms, timedOut}`. On failure the thrown error carries only the
  `Error:`/`caused by` lines from stderr, scrubbed of addresses and keys and capped at 300 chars.
- `ZINGO_SEED` and `RUST_LOG` are removed from the child environment unless a restore passes the seed explicitly.
