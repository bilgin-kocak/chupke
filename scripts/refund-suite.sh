#!/usr/bin/env bash
# M2 live refund suite on testnet (real payments, real refunds): underpaid, over the per-order cap,
# a failing Bitrefill order, a duplicate payment, and a late payment for an expired quote.
#
# Needs: the worker running with GRACE_MIN=1, the web on $BASE, and a second web on $SHORT_BASE
# started with ORDER_TTL_MIN=1 (same database). Uses the CLI buyer wallet; never prints addresses.
#   scripts/refund-suite.sh <already-delivered-order-id>
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=${BASE:-http://localhost:8080}
SHORT_BASE=${SHORT_BASE:-http://localhost:8081}
DUP_ORDER=${1:?pass an already-delivered order id for the duplicate-payment case}
OUT=data/logs/refund-suite.txt
BUYER_UA=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("data/wallets/buyer/addresses.json","utf8"))[0].encoded_address)')

log() { echo "$(TZ=Asia/Kolkata date +%H:%M:%S) $*" | tee -a "$OUT"; }
new_order() { # sku base -> order id
  curl -sS -o /dev/null -w '%{redirect_url}' -X POST --data-urlencode "sku=$1" --data-urlencode "reply=$BUYER_UA" "$2/orders" | sed 's#.*/o/##'
}
spendable() { npm run -s wallet:smoke -- --wallet buyer 2>/dev/null | grep -oE 'spendable [0-9]+' | grep -oE '[0-9]+' || echo 0; }
wait_spendable() { # zat
  for _ in $(seq 1 60); do [ "$(spendable)" -ge "$1" ] && return 0; sleep 15; done
  log "buyer never reached $1 zat spendable"; exit 1
}
pay() { # order [amount]
  local extra=(); [ -n "${2:-}" ] && extra=(--amount "$2")
  npm run -s buyer:pay -- --order "$1" --base "$3" "${extra[@]}" | grep -E '^sent' | sed 's/^/    /' | tee -a "$OUT"
}

: > "$OUT"
log "refund suite start"
E=$(new_order test-ok "$SHORT_BASE"); log "expired-quote order $E created with a 1-minute TTL"

U=$(new_order test-ok "$BASE"); log "underpaid order $U: paying 0.005 of 0.01 TAZ"
wait_spendable 600000; pay "$U" 500000 "$BASE"

B=$(new_order test-big "$BASE"); log "over-cap order $B (\$20 > \$10 cap): paying 0.02 TAZ"
wait_spendable 2100000; pay "$B" "" "$BASE"

F=$(new_order test-fail "$BASE"); log "failing-product order $F: paying 0.01 TAZ"
wait_spendable 1100000; pay "$F" "" "$BASE"

log "duplicate payment for delivered order $DUP_ORDER: paying 0.01 TAZ again"
wait_spendable 1100000; pay "$DUP_ORDER" "" "$BASE"

log "late payment for expired order $E: paying 0.01 TAZ"
wait_spendable 1100000; pay "$E" "" "$SHORT_BASE"

echo "U=$U B=$B F=$F E=$E DUP=$DUP_ORDER" > data/logs/refund-suite.ids
log "all payments sent; waiting for the worker to refund them"
for id in "$U" "$B" "$F" "$E"; do
  for _ in $(seq 1 120); do
    st=$(curl -sS "$BASE/api/o/$id" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(j.stage+" | "+(j.reasonText??"")+" | "+(j.refundTxid??""))})')
    case "$st" in refunded*) log "order $id: $st"; break ;; esac
    sleep 10
  done
done
log "refund suite done (duplicate refund: see data/chupke.db payments for order $DUP_ORDER)"
