#!/usr/bin/env bash
# Build zingo-cli for Chupke from a pinned zingolib commit and install it at bin/zingo-cli.
#
# Why these flags (details in docs/WALLET.md):
# - zingo-cli 0.5.0's default build routes every send over the Nym mixnet and fails closed.
#   ZINGO_BUILD=nakednet (default) builds without Nym plus `nakednet-test-mode`, so the
#   wallet talks to lightwalletd directly. ZINGO_BUILD=nym builds the upstream default and
#   also nym-proxy, the mixnet SOCKS5 child that zingo-cli spawns when it goes online; it is
#   installed beside zingo-cli, where zingo-cli looks for it first.
# - ZINGO_BIN_DIR (default ./bin) and CARGO_TARGET_DIR let a second flavor build side by side
#   without replacing the binary a running worker uses.
# - patches/zingo-netutils-extra-ca.patch adds an optional extra TLS trust root read from
#   ZINGO_EXTRA_CA_FILE (for egress proxies that re-terminate TLS). Unset = upstream behavior.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZINGOLIB_REPO="${ZINGOLIB_REPO:-https://github.com/zingolabs/zingolib}"
ZINGOLIB_REV="${ZINGOLIB_REV:-3f2529e2284d07925abd41b0fa0f1d40143f9241}"
ZINGOLIB_DIR="${ZINGOLIB_DIR:-$ROOT/../zingolabs/zingolib}"
ZINGO_BUILD="${ZINGO_BUILD:-nakednet}"
BIN_DIR="${ZINGO_BIN_DIR:-$ROOT/bin}"
TARGET_DIR="${CARGO_TARGET_DIR:-$ZINGOLIB_DIR/target}"
PATCH="$ROOT/patches/zingo-netutils-extra-ca.patch"

if [ ! -d "$ZINGOLIB_DIR/.git" ]; then
  mkdir -p "$(dirname "$ZINGOLIB_DIR")"
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 "$ZINGOLIB_REPO" "$ZINGOLIB_DIR"
fi
cd "$ZINGOLIB_DIR"

if [ "$(git rev-parse HEAD)" != "$ZINGOLIB_REV" ]; then
  git fetch --depth 1 origin "$ZINGOLIB_REV"
  git checkout --detach --force "$ZINGOLIB_REV"
fi

if git apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "build-zingo: CA patch already applied"
else
  git apply "$PATCH"
  echo "build-zingo: CA patch applied"
fi

# zingolib's build.rs downloads the Sapling proving parameters with a webpki-only TLS client,
# which fails behind a TLS-re-terminating proxy. Pre-fetch them with curl (honors the system CA
# and HTTPS_PROXY) into the default cache; zcash_proofs then finds them and skips the download.
PARAMS_DIR="${ZCASH_PARAMS_DIR:-$HOME/.zcash-params}"
fetch_param() { # name, expected BLAKE2b-512, part count
  local name="$1" want="$2" parts="$3" tmp
  if [ -f "$PARAMS_DIR/$name" ] && [ "$(b2sum "$PARAMS_DIR/$name" | cut -d' ' -f1)" = "$want" ]; then return; fi
  mkdir -p "$PARAMS_DIR"; tmp="$PARAMS_DIR/$name.tmp"; : > "$tmp"
  for i in $(seq 1 "$parts"); do
    curl -fsSL "https://download.z.cash/downloads/$name.part.$i" >> "$tmp"
  done
  [ "$(b2sum "$tmp" | cut -d' ' -f1)" = "$want" ] || { echo "build-zingo: bad hash for $name" >&2; rm -f "$tmp"; exit 1; }
  mv "$tmp" "$PARAMS_DIR/$name"; echo "build-zingo: fetched $name"
}
fetch_param sapling-spend.params 8270785a1a0d0bc77196f000ee6d221c9c9894f55307bd9357c3f0105d31ca63991ab91324160d8f53e2bbd3c2633a6eb8bdf5205d822e7f3f73edac51b2b70c 2
fetch_param sapling-output.params 657e3d38dbb5cb5e7dd2970e8b03d69b4787dd907285b5a7f0790dcc8072f60bf593b32cc2d1c030e00ff5ae64bf84c5c3beb84ddc841d48264b4a171744d028 2

case "$ZINGO_BUILD" in
  nakednet) FEATURE_ARGS=(--no-default-features --features nakednet-test-mode) ;;
  nym) FEATURE_ARGS=() ;;
  *) echo "build-zingo: ZINGO_BUILD must be nakednet or nym" >&2; exit 2 ;;
esac

echo "build-zingo: cargo build ($ZINGO_BUILD) at $ZINGOLIB_REV"
cargo build --release --locked -p zingo-cli "${FEATURE_ARGS[@]}"

mkdir -p "$BIN_DIR"
install -m 0755 "$TARGET_DIR/release/zingo-cli" "$BIN_DIR/zingo-cli"
if [ "$ZINGO_BUILD" = nym ]; then
  # A plain `cargo build -p zingo-cli` never produces nym-proxy (it sits behind zingo-netutils'
  # nym feature); upstream's `makers bundle-nym-proxy` runs exactly this build.
  cargo build --release --locked -p zingo-netutils --features nym --bin nym-proxy
  install -m 0755 "$TARGET_DIR/release/nym-proxy" "$BIN_DIR/nym-proxy"
  echo "build-zingo: installed $BIN_DIR/nym-proxy"
else
  rm -f "$BIN_DIR/nym-proxy" # a stale proxy from an earlier nym build would not be used, but don't ship it
fi
"$BIN_DIR/zingo-cli" --version
echo "build-zingo: installed $BIN_DIR/zingo-cli ($ZINGO_BUILD)"
