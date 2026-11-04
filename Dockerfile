# syntax=docker/dockerfile:1
# Chupke image: one image, two processes (web and worker) chosen by the compose command.
# The first build compiles zingo-cli from a pinned zingolib commit (about 5–15 minutes).

# --- 1. zingo-cli (see docs/WALLET.md for why nakednet-test-mode and the CA patch) -------------
FROM rust:1-bookworm AS zingo
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake clang libsqlite3-dev git curl ca-certificates coreutils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY scripts/build-zingo.sh scripts/build-zingo.sh
COPY patches patches
ENV ZINGOLIB_DIR=/src/zingolib
RUN scripts/build-zingo.sh

# --- 2. node_modules (better-sqlite3 is native) ------------------------------------------------
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 3. runtime ---------------------------------------------------------------------------------
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=zingo /src/bin/zingo-cli bin/zingo-cli
COPY package.json tsconfig.json ./
COPY config config
COPY src src
COPY scripts scripts
RUN useradd --system --uid 10001 chupke && mkdir -p /app/db /app/wallets && chown chupke /app/db /app/wallets
USER chupke
ENV DATABASE_PATH=/app/db/chupke.db \
    SHOP_WALLET_DIR=/app/wallets/shop \
    INBOX_WALLET_DIR=/app/wallets/inbox \
    ZINGO_CLI_PATH=/app/bin/zingo-cli
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "src/web/server.ts"]
