#!/usr/bin/env bash
# Build zingo-cli for Chupke from a pinned zingolib commit and install it at bin/zingo-cli.
#
# Why these flags (details in docs/WALLET.md):
# - zingo-cli 0.5.0's default build routes every send over the Nym mixnet and fails closed.
#   ZINGO_BUILD=nakednet (default) builds without Nym plus `nakednet-test-mode`, so the
#   wallet talks to lightwalletd directly. ZINGO_BUILD=nym builds the upstream default.
# - patches/zingo-netutils-extra-ca.patch adds an optional extra TLS trust root read from
#   ZINGO_EXTRA_CA_FILE (for egress proxies that re-terminate TLS). Unset = upstream behavior.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZINGOLIB_REPO="${ZINGOLIB_REPO:-https://github.com/zingolabs/zingolib}"
ZINGOLIB_REV="${ZINGOLIB_REV:-3f2529e2284d07925abd41b0fa0f1d40143f9241}"
ZINGOLIB_DIR="${ZINGOLIB_DIR:-$ROOT/../zingolabs/zingolib}"
ZINGO_BUILD="${ZINGO_BUILD:-nakednet}"
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

case "$ZINGO_BUILD" in
  nakednet) FEATURE_ARGS=(--no-default-features --features nakednet-test-mode) ;;
  nym) FEATURE_ARGS=() ;;
  *) echo "build-zingo: ZINGO_BUILD must be nakednet or nym" >&2; exit 2 ;;
esac

echo "build-zingo: cargo build ($ZINGO_BUILD) at $ZINGOLIB_REV"
cargo build --release --locked -p zingo-cli "${FEATURE_ARGS[@]}"

mkdir -p "$ROOT/bin"
install -m 0755 target/release/zingo-cli "$ROOT/bin/zingo-cli"
"$ROOT/bin/zingo-cli" --version
echo "build-zingo: installed $ROOT/bin/zingo-cli"
