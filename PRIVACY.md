# Chupke privacy design

This page answers four questions about what Chupke reveals. Naming a gap costs nothing, so the gaps are listed plainly.

## 1. What stays private

- **On chain:** the sender, receiver, amount and memo of all three transfers (the payment, the delivery and the refund).
  All are shielded transactions to and from unified addresses. On NU7 testnet they land in the Ironwood pool,
  so observers see encrypted outputs and fees, not who paid whom or what the memo says.
- **The gift card code** never appears on any web page, in any log, in the database or in the events table. The worker
  fetches it from Bitrefill at send time, holds it in memory and writes it straight into an encrypted memo
  (invariant I6). Invoice responses from Bitrefill embed the code too, and Chupke strips it as soon as it parses them.
- **The web server holds no keys.** It has no wallet, no viewing key and no Bitrefill key. In Docker it gets no `.env`
  and never mounts the wallets volume. On Railway, where both run in one container (docs/DEPLOY.md), the web runs as a
  separate unprivileged user with only its public variables and can't read the wallet directory. That is a weaker
  boundary than two containers: an attacker who took over the web and then gained root in the container would reach
  the wallets.
- **No accounts and no email.** The only thing tying a buyer to an order is the reply address they choose to put in
  the memo, and a fresh address per order is recommended.
- **A fresh shop address for every order.** Each order page shows its own diversified address of the shop wallet
  ([ZIP 316](https://zips.z.cash/zip-0316)), which is never shown for another order. Comparing order pages or payment
  requests doesn't link them to one shop address. The worker derives these addresses in advance and the web, which
  holds no keys, only hands them out.
- **Logs are scrubbed.** pino redacts secret fields by name and scrubs anything that looks like an address or viewing key.
  Tests assert that codes, addresses and memos never reach logs or `events.detail`. A scan of the live logs after the
  testnet runs found zero.

## 2. What's revealed, and to whom

| Who | Sees |
| --- | --- |
| **Light-wallet server** (`testnet.zec.rocks`) | The worker's IP address, when it syncs, and which blocks and transactions it downloads. The demo build uses zingo-cli's `nakednet-test-mode`, so there is **no Nym**, and zingo-cli itself warns that "the indexer sees this machine's IP address". The `:nym` image (built, not yet run against the mixnet) sends every transaction over Nym; its sync still connects directly. |
| **The web server** | The buyer's IP address and page visits (Chupke itself logs no requests, but a hosting provider or proxy might), and the reply address, kept so the order page can show the memo. It is deleted 60 minutes after the order ends. |
| **The operator** (whoever runs the worker) | The order, the amount, the product, and the reply address until it is purged. The dashboard masks addresses to 8 characters, but the database holds the full address until the purge. |
| **Bitrefill** | That the shop bought product X at time T from its own balance. It never sees the buyer's wallet, address, IP or payment. |
| **Anyone with the order link** | The order's status and its own shop address, and until the purge the payment memo, which includes the reply address. Order ids are 10 random Crockford base32 characters (50 bits). |

## 3. What users must trust

- **The operator holds the buyer's money** between payment and delivery. This is not trustless escrow: the guarantee is
  operational (caps, exactly-once purchasing and automatic refunds), not cryptographic. The operator can also read the
  delivered code again later through the shop's outgoing viewing key, because the shop wallet sent that memo.
- **The hosted light-wallet server and Bitrefill.**
  - A malicious light-wallet server could withhold or delay transactions, which delays delivery or refunds. It can't
    steal funds or read memos.
  - Bitrefill must deliver valid codes. Delivery is accepted only when every Bitrefill order says `delivered`.
- **Confirmation depth.** The demo accepts a payment after **1 confirmation**; a reorg deeper than that could reverse a
  payment after the purchase. The shop wallet itself only spends notes with 3 confirmations, zingo-cli's default.
- **The demo binary.** The zingo-cli build is pinned and carries one small local patch, an opt-in extra TLS root that
  this sandbox needed. Both the patch and the reasons are in [docs/WALLET.md](docs/WALLET.md).

## 4. What we'd fix next

1. **Nym for wallet traffic.** CI builds a `:nym` image with zingo-cli's default mixnet build, which sends every
   transaction over Nym and fails closed instead of going direct. The next step is running it on a host where the
   mixnet is reachable. Its sync still connects directly, so the light-wallet server would still see the worker's IP
   and when it syncs, but not which transactions it sends.
2. **The split view-only inbox everywhere.** `WALLET_MODE=split` is built and tested: a UFVK-only inbox watches for
   payments and the spending wallet only sends. The next step is running them on separate machines. Until then, the UFVK
   passes through zingo-cli's command line while the inbox is being created.
3. **Delivery memos without an outgoing viewing key**, so the operator can't re-read delivered codes. That means sending
   deliveries with no OVK, or from a throwaway wallet funded per delivery.
4. **Match payments by address as well as memo.** Per-order diversified addresses are live, but the memo's order id is
   still the only link from a payment to its order, because zingo-cli 0.5.0 doesn't report which of the shop's
   addresses received a note. With that, a payment that lost its memo could still be tied to its order.
5. **Nym/Tor-friendly order pages**: no JavaScript requirement, static-first pages, an onion service.
6. **Batched balance top-ups** (ZEC → USDC), so the timing of top-ups doesn't mirror individual purchases.
