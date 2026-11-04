# Zcash wallet tooling notes (zingo-cli)

Findings from M0 (Wed 4 Nov 2026, IST). Every command below was run for real against NU7 testnet.
Addresses are shortened, and seeds and viewing keys are never shown. The sandbox shell sets
`ZINGO_EXTRA_CA_FILE=/root/.ccr/ca-bundle.crt` (see *TLS* below).

## Network facts (live)

`zingo-cli --chain testnet --server https://testnet.zec.rocks:443 --data-dir <dir> --nosync info` → exit 0:

```json
{
  "version": "v0.6.1",
  "git_commit": "af8ad1bd38d1d9a9951669b4bf193409ce5768e1",
  "server_uri": "https://testnet.zec.rocks:443/",
  "vendor": "ECC LightWalletD",
  "taddr_support": true,
  "chain_name": "test",
  "sapling_activation_height": 280000,
  "consensus_branch_id": "77190ad9",
  "latest_block_height": 4581203
}
```

Raw gRPC `GetLightdInfo` also reports Zebra `v7.0.0+git.e8db87e` (built 2026-11-02). In the sync
trace, blocks arrived roughly every 25–40 s.

## Build (scripts/build-zingo.sh)

- zingolib `3f2529e2284d07925abd41b0fa0f1d40143f9241` (2026-11-02, HEAD of `dev`), which is zingo-cli
  **0.5.0** per its CHANGELOG (released 2026-10-28). Note that `zingo-cli --version` prints
  `Zingo CLI 0.1.1`, so don't trust that string.
- `rust-toolchain.toml` pins Rust 1.99.0, which rustup installs on the first build.
- Command: `cargo build --release --locked -p zingo-cli --no-default-features --features nakednet-test-mode`.
  In a 4-vCPU sandbox the cold build took about 4 minutes of wall time: 2m37s until the Sapling-params
  failure below, then 1m37s after the fix.
- **Why `nakednet-test-mode`**: since 0.5.0, the default build (feature `nym`) runs every
  transmission over the Nym mixnet and *fails closed*, while only sync uses a direct connection. A build
  without `nym` refuses to go online at all, unless it has `nakednet-test-mode`. This sandbox's egress
  proxy can't carry the mixnet (no WebSocket, no non-443 ports), so the demo build talks to
  lightwalletd directly. Each online launch prints:
  `WARNING: this build carries nakednet-test-mode, so it went online with NO mixnet ... the indexer sees this machine's IP address.`
  To try Nym on a normal VM, use `ZINGO_BUILD=nym scripts/build-zingo.sh`, which also needs the
  bundled `nym-proxy` (`makers run-cli --build-only`). The SPEC's
  `--manifest-path zingo-netutils/Cargo.toml` command is stale: netutils has been a workspace member
  since zingolib PR #3037.
- **TLS**: zingo-netutils trusts only the compiled-in webpki (Mozilla) roots (zingo ADR 0021), so a
  TLS-re-terminating egress fails with `InvalidCertificate(UnknownIssuer)`.
  `patches/zingo-netutils-extra-ca.patch` adds an optional extra trust root from
  `ZINGO_EXTRA_CA_FILE`. Verification stays on, and with the variable unset the behavior is unchanged.
- **Sapling params**: `zingolib/build.rs` downloads `sapling-{spend,output}.params` with the same
  webpki-only client, which fails behind the proxy (`UnknownIssuer`). The build script pre-fetches them with
  curl into `~/.zcash-params` and checks the BLAKE2b-512 hashes taken from `zcash_proofs` 0.31.0.

## Connectivity model (0.5.0)

- It is offline-first. `--server <uri>` both pins the indexer and grants online consent. `--offline` is a
  deliberate zero-network session. Local reads (`addresses`, `notes`, `messages`, `height`,
  `balance`, `export_ufvk`) work under `--offline`.
- An unconsented session hides network commands **even from help**: `help quicksend` printed
  `Command quicksend not found` (exit 0). `quicksend --help` works.
- stdout carries only the command result; errors go to stderr with a non-zero exit. With `RUST_LOG`
  set, tracing lines appear on **stdout**, so the adapter unsets `RUST_LOG`.

## The `--waitsync` gotcha (important)

zingolib persists `sync_config.shutdown_on_completion` **in the wallet file at creation**, from the
`--waitsync` flag of the first launch (`build_zingo_config` in `zingo-cli/src/lib.rs`; written in
`zingolib/src/wallet/disk.rs`). A wallet created without `--waitsync` syncs continuously forever, and
any later `--waitsync <cmd>` **never returns**. We saw a 120 s and a 300 s timeout on a wallet first
opened with `--nosync info`, while the trace showed it fully synced and following new blocks and the
mempool. A wallet created with `--waitsync` returns in 2–3 s.
→ `ZingoWallet.initWallet()` always creates (and restores) with `--waitsync`.

## Wallets

Each was created once with
`zingo-cli --chain testnet --server https://testnet.zec.rocks:443 --data-dir data/wallets/<name> --waitsync addresses`
(exit 0, 3 s). The birthday is set automatically to tip − 100 (e.g. a scratch wallet created at tip
4581204 got `birthday` 4581104), which matches the SPEC rule. `recovery_info` goes only to
`data/wallets/<name>/RECOVERY.txt` (mode 0600, 7 text lines) and is never printed.

| wallet | data dir | primary UA |
| --- | --- | --- |
| shop | `data/wallets/shop` | `utest1l6w362…vt9vsa` (110 chars) |
| buyer | `data/wallets/buyer` | `utest1vfvu9f…e4nvct` (110 chars) |

`addresses` output (exit 0): `[{"account":0,"address_index":0,"has_orchard":true,"has_sapling":false,"has_transparent":false,"encoded_address":"utest1…"}]`,
which is a shielded-only UA. `wallet_kind` reports `transparent/sapling/orchard: true` (there is no
separate Ironwood key line), while `balance` and `notes` report an `ironwood` pool.

## Command outputs the adapter parses (src/zcash/zingo.ts)

| purpose | command | output |
| --- | --- | --- |
| chain height | `--nosync info` | JSON, `latest_block_height` (fresh from the server) |
| wallet's view of height | `--offline height` | JSON `{"height": N}` (as of the wallet's last server request) |
| sync | `--waitsync height` | syncs to the tip, then prints the height (2–3 s when caught up) |
| primary address | `--offline addresses` | JSON array, `address_index` 0 |
| balance | `--offline spendable_balance` + `--offline balance` | JSON `{"spendable_balance": N}`; `balance` is **not JSON** (`total_<pool>_balance: N` lines for ironwood/orchard/sapling/transparent) |
| received outputs | `--offline notes all` | JSON `{ironwood_notes,orchard_notes,sapling_notes}.note_summaries[]`: `value, status ("confirmed at block height H" / mempool / transmitted / calculated / failed), spend_status, memo, time, txid, output_index, account_id, scope`. The adapter keeps `scope == "external"`, which drops change. |
| sent memos | `--offline messages` | JSON `{"value_transfers":[{txid, datetime, status, blockheight, transaction_fee, kind ("sent", "received", "send-to-self", …), value, recipient_address, pools_sent_from, pools_received, memos[]}]}` |
| send | `--waitsync quicksend '[{"address":…,"amount":…,"memo":…}]'` | JSON `{"txids":[…],"transmissions":[…]}` |
| UFVK | `--offline export_ufvk` | JSON `{"ufvk":"uviewtest1…","birthday":N}` (secret: never logged) |
| settings | `--offline settings` | text: `performance: high`, `min confirmations: 3`, `transparent gap limit: 10` |

`value_transfers` and `transactions` print nothing for an empty wallet, and their format with data is
still to be checked. The adapter doesn't need them.

## SPEC §6 VERIFY answers

1. **Received notes with memos**: `notes all` gives per-output JSON with `memo` and `output_index`.
   `messages` gives memo-bearing value transfers (received and sent) as JSON.
2. **Send flow**: `send` stores a proposal, and it "holds sync paused until it is settled". `confirm`
   transmits it and `decline` drops it. `quicksend` does both in one call, and the txid is `txids[0]` of
   its JSON output. In one-shot mode this has to be `quicksend`.
3. **UFVK and height**: `export_ufvk` gives JSON `{ufvk, birthday}`. The chain height comes from `info`
   (`latest_block_height`); the wallet's last-seen height comes from `height`.
4. **Confirmations before spendable**: the wallet default is `min_confirmations` = **3**. It can be
   changed with `settings min_confirmations <n>` (1 or greater).
5. **NU7 utest1 send and explorer**: *pending funded wallets* (see the send log below).
   `testnet.zcashexplorer.app` answers 403 (nginx) to this sandbox's egress, so explorer links have
   to be opened from a normal browser. The txid is also checked with lightwalletd `GetTransaction`.

## Send log

_(filled in once the faucet funds arrive)_
