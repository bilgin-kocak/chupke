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
| per-order address | `--offline new_address o` | JSON `{"account":0,"address_index":N,"has_orchard":true,"has_sapling":false,"has_transparent":false,"encoded_address":"utest1…"}`; the wallet file keeps it (a later `addresses` lists it) |
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

### Receive: faucet → buyer (12:42 IST)
- `listIncoming` (adapter `notes all`) returned one output with key
  `c3178bd7950353d9ba58c370983d8102a705227000f42fcb3c045747700146ef:ironwood:0`:
  pool **ironwood**, 100,000,000 zat (1 TAZ), mined at 4581267, and a memo of 74 bytes (the faucet's text,
  not printed). Explorer link:
  https://testnet.zcashexplorer.app/transactions/c3178bd7950353d9ba58c370983d8102a705227000f42fcb3c045747700146ef
- Sending to a UA whose only shielded receiver is orchard-type landed in the Ironwood pool, which is
  consistent with Orchard being sealed.
- `balance` showed `total_ironwood_balance: 100_000_000` with underscore digit separators. The parser
  was fixed in commit "parse underscore digit separators".
- `spendable_balance` stays 0 until the note has `min_confirmations` (3) confirmations. It went from 0 to
  100,000,000 about 2 minutes after the note was mined.

### Send 1: buyer → shop with a payment memo (12:45 IST)
- Command (adapter `send`): `zingo-cli --chain testnet --data-dir data/wallets/buyer --server https://testnet.zec.rocks:443 --waitsync quicksend '[{"address":"<shop UA>","amount":600000,"memo":"CHUPKE1 o=<10 chars> r=<buyer UA>"}]'`.
  It exited 0 after 5.3 s, including sync and proving. stdout was JSON `{"txids":["efe4efd4…"],"transmissions":[…]}`.
- txid `efe4efd400c39d6d46464c6c238e0aa156081153b97e7f36c9717ede0fc6bae7`, mined at **4581272**.
  `scripts/tx-status.ts` (lightwalletd `GetTransaction`) reported 9,166 bytes mined at 4581272.
  https://testnet.zcashexplorer.app/transactions/efe4efd400c39d6d46464c6c238e0aa156081153b97e7f36c9717ede0fc6bae7
- Shop side: `listIncoming` returned `efe4efd4…bae7:ironwood:0`, pool ironwood, 600,000 zat, conf 1.
  The memo matched **byte for byte**, checked by sha256 against the sender's record, with the memo never
  printed. That means the 133-byte `CHUPKE1 o=… r=<utest1…>` payment memo survives the round trip intact.
- The fee came out of the buyer's change (ZIP 317, computed by the wallet).

### Send 2: shop → buyer, 1,000 zat with a memo (12:47 IST)
- The shop's 600,000 zat became spendable at 12:46:51, about a minute after mining (3 confirmations at
  roughly 25 s per block). Then the adapter's `send` ran once:
  `--waitsync quicksend '[{"address":"<buyer UA>","amount":1000,"memo":"Chupke smoke <iso time>"}]'`
  It exited 0 after 5.8 s.
- txid `32ba681f33e57a8ebb32ca3a14b0bc4de26c4c2e9845c2f40acb2c1d5d6c091d`, mined at **4581277**
  (confirmed by `tx-status`).
  https://testnet.zcashexplorer.app/transactions/32ba681f33e57a8ebb32ca3a14b0bc4de26c4c2e9845c2f40acb2c1d5d6c091d
- **A 1,000-zat output is accepted**, so `DELIVERY_AMOUNT_ZAT=1000` works as is.
- Buyer side: `listIncoming` shows `32ba681f…091d:ironwood:0`, 1,000 zat, and the memo is byte-exact.
- Shop side: `listSent` (from `messages`) shows the send with `to` = the buyer UA, amount 1,000, and the
  37-byte memo. The worker can therefore find its own deliveries and refunds after a crash, by the
  `#<orderId> delivered` / `ref <txid8>` tags.
- Fee: 600,000 − 1,000 − 589,000 = **10,000 zat** (ZIP 317 minimum, 2 logical actions).

### M2 findings

- **A refused send is identifiable.** If the wallet can't cover the amount, `quicksend` exits 1 with
  `Error: Send error.` / `caused by: Propose send error.` /
  `caused by: Insufficient balance (have 98380000, need 100000010000 including fee)`. This fails at the
  proposal stage, so nothing was built or broadcast. The adapter raises `SendNotBroadcastError` for it, and
  the engine retries on normal backoff instead of its 3-minute "may have gone out" guard. The same output
  also shows the fee: 10,000 zat.
- **Change needs 3 confirmations.** A single-note wallet can send again only after its change has
  3 confirmations, which takes about 75–120 s at ~25–40 s blocks. Back-to-back sends from one wallet
  therefore space themselves by about two minutes; the refund suite waits for `spendable` between payments.
- **Split mode works with a view-only wallet.** `scripts/init-inbox.ts` exported the shop UFVK (514 chars,
  birthday 4581118) and created a view-only wallet with `--viewkey <UFVK> --birthday <H> --waitsync`. It
  synced in about 3 s.
  - Its primary address is identical to the shop wallet's.
  - `notes all` gives the same 4 outputs with identical payment keys.
  - `quicksend` from it fails, as it should for a view-only wallet.
  - Caveat: zingo-cli has no environment variable for a viewing key, so the UFVK sits on the
    command line, and in the local process list, while the inbox is being created.
- **Full rescan.** `rescan` restarts sync inside its own process, which one-shot mode would abandon when it
  exits. `ZingoWallet.rescan()` therefore runs `--nosync clear`, which drops every note, coin and
  transaction, and then `--waitsync height`, which syncs again from the birthday.

### Restore from seed (the deploy path), 14:50 IST
- `ZingoWallet.initWallet({ seed, birthday })` is what the worker runs on a fresh machine. It passes the seed
  in `ZINGO_SEED` (never on the command line), with `--birthday 4581118 --waitsync`. The restore into a throwaway
  directory took 4.1 s.
- Result: the same primary address as the shop wallet, the same 9 received outputs with identical payment keys,
  and an equal total balance (102,517,000 zat). The copy, which holds the seed, was then deleted.

### VERIFY 5 answer
A send to a `utest1` address is accepted on NU7 testnet. Both test transactions were mined in Ironwood
outputs, and their explorer links are listed above. The explorer itself 403s from the sandbox; the
on-chain check was done with lightwalletd `GetTransaction`.

### Diversified addresses (per-order), 16:10 IST
- **One-shot `new_address o` persists.** Two calls on a throwaway wallet returned `address_index` 1 and 2, and a later
  `addresses` listed indexes 0–2. Each is a 110-character `utest1` address with an Orchard receiver only.
- **A view-only wallet derives the same addresses.** A UFVK-only wallet made from that throwaway wallet returned the
  same encoded address at indexes 0, 1 and 2 as the full wallet. So in split mode the inbox derives the per-order
  addresses, and the spending wallet is never touched for them.
- **The inbox receives payments to them.** Order Y94QVCAHVB was paid at its own address (index 1). The view-only inbox
  listed the note at 0 confirmations, in the Ironwood pool, like a payment to the primary address.
- **What zingo-cli doesn't say:** which address a note was paid to. `notes all` has no address or diversifier
  field, and zingolib's `BasicNoteSummary` carries `TODO: add key id with address index`. Chupke therefore still
  matches payments to orders by memo.

### The Nym build (`ZINGO_BUILD=nym`), 16:30 IST
Built locally from the same pinned commit and patch, beside the nakednet binary (`CARGO_TARGET_DIR` and `ZINGO_BIN_DIR`
pointed elsewhere, so the running worker's `bin/zingo-cli` was untouched). CI builds the same thing as the `:nym` image.
- **What it is:** upstream's default build. A connected session runs Mixnet Mode unconditionally: transaction broadcasts
  and price fetches go over Nym through a `nym-proxy` child (a SOCKS5 proxy), sync alone goes direct to lightwalletd,
  and nothing falls back to a direct broadcast (zingo-cli 0.5.0 CHANGELOG). `nym-proxy` comes from a second cargo build,
  `-p zingo-netutils --features nym --bin nym-proxy`, and is installed beside zingo-cli, the first place it looks.
- **Offline it reads the same wallet files.** On a throwaway copy of the buyer wallet, `--offline addresses` gave the
  same primary address as the nakednet build, and `--offline notes all` listed the same 26 notes.
- **It fails closed.** Going online with no `nym-proxy` available exits 1 at once, before any sync:
  `Error: Mixnet Mode is required for a connected session: Mixnet Mode could not start.` The adapter now treats this
  error on a send as "never broadcast" (`sendNeverRan`), because zingo-cli raises it while starting the session, before
  its pre-send sync. The worker then retries quickly instead of waiting out the resend guard.

