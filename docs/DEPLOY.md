# Deploy Chupke to a public URL

Chupke runs as one Docker image with two processes. The **worker** has the wallets, the Bitrefill key and
the state machine, and is never exposed. The **web** is public and has no secrets.
CI publishes the image as `ghcr.io/bilgin-kocak/chupke:latest`.

> **One worker per shop seed.** Before you start a worker anywhere, stop every other worker that uses the same
> shop seed, including the development sandbox. Two workers would each see every payment, buy twice and
> deliver twice. They keep separate databases, so exactly-once can't hold across them.

## 1. A machine

Either of these works:

- **A VM** (recommended): Ubuntu 24.04, 2 vCPU, 4 GB RAM and 20 GB disk if you build there; 1 vCPU and 1 GB
  is enough if you pull the image. Open TCP 80 and 443, or just 8080. Then install Docker:

  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  ```

- **Your laptop** with Docker Desktop, using the `tunnel` profile for a public HTTPS URL.

## 2. Code and secrets

```bash
git clone https://github.com/bilgin-kocak/chupke && cd chupke
```

Create `.env` in the repo root. Only the worker reads it; the web gets only the public variables that
`docker-compose.yml` names.

```dotenv
# --- worker secrets ---
# Your Bitrefill personal API key (bitrefill.com/account/developers).
BITREFILL_API_KEY=
# The 24 words and birthday from data/wallets/shop/RECOVERY.txt. Remove ZINGO_SEED after the first start.
ZINGO_SEED=
WALLET_BIRTHDAY=
# A view-only inbox watches for payments; the full wallet only sends.
WALLET_MODE=split
ALLOW_REAL_PURCHASES=false
# --- web (public) ---
DASHBOARD_PASSWORD=
PUBLIC_BASE_URL=
# Only for the tls profile, e.g. chupke.example.com (with a DNS A record pointing at the VM).
DOMAIN=
```

Don't set `ZINGO_EXTRA_CA_FILE` on a normal machine. It exists only for the sandbox's TLS-intercepting proxy.

## 3. Start

```bash
docker compose pull && docker compose up -d
```

The package is public, so no `docker login` is needed. The image of the last code commit (`7a7cbc4`) was run end to
end as containers on 4 Nov (docs/NOTES.md, "Final image, live as containers"). If a pull is ever denied, build locally instead:

```bash
docker compose up -d --build
```

On first start the worker restores the shop wallet from `ZINGO_SEED` and syncs from `WALLET_BIRTHDAY`, which takes
seconds on testnet. In split mode it then derives the view-only inbox. Check that it started:

```bash
docker compose logs worker | grep -E 'worker started|restoring|inbox'
```

Then remove `ZINGO_SEED` from `.env`. The wallet file now lives in the `chupke-wallets` volume.

**Moving a shop that already took orders?** Bring its database (`data/db`, or the `chupke-db` volume) along with the
seed. A wallet restored from the seed derives per-order addresses from index 1 again, and only the database knows
which ones were already handed out. With the old database the worker skips those; with a fresh one the new machine
can show an address an earlier deployment already gave another buyer. Payments would still work, because they are
matched by memo.

## 4. Public URL

Use either your own domain, with automatic HTTPS from Caddy (set `DOMAIN` first):

```bash
docker compose --profile tls up -d
```

or, without a domain, a Cloudflare quick tunnel:

```bash
docker compose --profile tunnel up -d
```

```bash
docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

Put the URL in `PUBLIC_BASE_URL` and run `docker compose up -d web`, which recreates the web container with the new value.

## 5. Check it

- `https://<url>/healthz` should show `"shopReady":true` and a `lastTickAt` a few seconds old.
- `https://<url>/dashboard` (user `chupke`, password `DASHBOARD_PASSWORD`) shows balances, caps and events.
- From a phone: open the URL, pick **Test gift card**, paste a fresh address from your testnet wallet, pay the QR.
  The status goes seen → confirmed → buying → delivered → sent, and the code arrives in your wallet's memos.

## 6. Optional: the Nym image

CI also publishes `ghcr.io/bilgin-kocak/chupke:nym`. It is the same app with upstream zingo-cli's default build, where
every transaction broadcast goes over the Nym mixnet and fails closed rather than going direct. Sync stays a direct
connection to lightwalletd, so the server still sees the worker's IP while it syncs, but not which transactions it
sends. `nym-proxy`, the mixnet client zingo-cli starts when it goes online, ships beside zingo-cli in the image.

Add these to `.env`, then pull and start as in step 3:

```dotenv
CHUPKE_IMAGE=ghcr.io/bilgin-kocak/chupke:nym
TICK_MS=30000
```

```bash
docker compose logs worker | grep 'worker started'
```

That line should show `"zingoBuild":"nym"`.

**Status:** CI builds this image from the same pinned zingolib commit. It has not been run against the mixnet,
because the sandbox Chupke was built in can't reach Nym's gateways. Every online zingo-cli call (each sync and each
send) starts a mixnet client, so ticks get slower; that is why `TICK_MS` is raised above. If the mixnet can't be
reached, a send fails instead of falling back to a direct connection. The worker then treats it like any send that
might have gone out: it checks its own sent memos after the 3-minute guard before trying again.

## Operations

- **Stop safely:** `docker compose stop worker`. The worker finishes its current tick first, never cutting a wallet
  send in half (grace period 2 minutes).
- **Pause purchases:** set `PAUSE_PURCHASES=true` in `.env`, then run `docker compose up -d worker`. New payments are
  refunded with "Shop is paused".
- **Real purchases** need `ALLOW_REAL_PURCHASES=true`, an allowlisted `kind: "real"` product
  (`npx tsx scripts/mcp-catalog.ts --approve <sku>`), and Bitrefill balance.
- **Evidence table:** `docker compose exec web node_modules/.bin/tsx scripts/evidence.ts`.
