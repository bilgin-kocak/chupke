# syntax=docker/dockerfile:1
# Chupke image: one image, two processes (web and worker) chosen by the compose command.
# The first build compiles zingo-cli from a pinned zingolib commit (about 5–15 minutes).
#
#   docker build .                                   nakednet zingo-cli: direct to lightwalletd (the demo build)
#   docker build --build-arg ZINGO_BUILD=nym .       upstream's Nym build: every send over the mixnet, plus nym-proxy

# --- 1. zingo-cli (see docs/WALLET.md for why nakednet-test-mode and the CA patch) -------------
FROM rust:1-bookworm AS zingo
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake clang libsqlite3-dev git curl ca-certificates coreutils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY scripts/build-zingo.sh scripts/build-zingo.sh
COPY patches patches
ARG ZINGO_BUILD=nakednet
ENV ZINGOLIB_DIR=/src/zingolib ZINGO_BUILD=${ZINGO_BUILD}
RUN scripts/build-zingo.sh

# --- 2. node_modules (better-sqlite3 is native) ------------------------------------------------
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 3. runtime ---------------------------------------------------------------------------------
FROM node:22-bookworm-slim
ARG ZINGO_BUILD=nakednet
LABEL org.opencontainers.image.description="Chupke: shielded-ZEC checkout for Bitrefill gift cards (zingo-cli build: ${ZINGO_BUILD})"
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
# zingo-cli, plus nym-proxy beside it in the nym build (zingo-cli looks for the proxy next to itself)
COPY --from=zingo /src/bin/ bin/
COPY package.json tsconfig.json ./
COPY config config
COPY src src
COPY scripts scripts
RUN useradd --system --uid 10001 chupke && mkdir -p /app/db /app/wallets && chown chupke /app/db /app/wallets
USER chupke
ENV DATABASE_PATH=/app/db/chupke.db \
    SHOP_WALLET_DIR=/app/wallets/shop \
    INBOX_WALLET_DIR=/app/wallets/inbox \
    ZINGO_CLI_PATH=/app/bin/zingo-cli \
    CHUPKE_ZINGO_BUILD=${ZINGO_BUILD}
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "src/web/server.ts"]
