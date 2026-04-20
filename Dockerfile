FROM node:22-bookworm-slim AS node-runtime-builder

WORKDIR /usr/src/plenum/node-runtime
COPY plenum-js-runtime/node-runtime/package.json plenum-js-runtime/node-runtime/package-lock.json ./
RUN npm ci --omit=dev
COPY plenum-js-runtime/node-runtime/ ./

FROM lukemathwalker/cargo-chef:latest-rust-1.93-bookworm AS chef

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/plenum

FROM chef AS planner

COPY Cargo.toml Cargo.lock ./
COPY plenum-core/ plenum-core/
COPY openapi-overlay/ openapi-overlay/
COPY plenum-js-runtime/ plenum-js-runtime/
COPY plenum-sandbox/ plenum-sandbox/
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

COPY --from=planner /usr/src/plenum/recipe.json recipe.json

# Cook dependencies only -- this layer is cached until Cargo.toml/Cargo.lock change.
RUN cargo chef cook --release --recipe-path recipe.json -p plenum-core

COPY Cargo.toml Cargo.lock ./
COPY plenum-core/ plenum-core/
COPY openapi-overlay/ openapi-overlay/
COPY plenum-js-runtime/ plenum-js-runtime/
COPY plenum-sandbox/ plenum-sandbox/

RUN cargo build --release -p plenum-core

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bubblewrap \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/plenum/target/release/plenum-core /usr/local/bin/plenum-core
# Place node-runtime alongside the binary so locate_server_script() finds it.
COPY --from=node-runtime-builder /usr/src/plenum/node-runtime /usr/local/bin/node-runtime

ENTRYPOINT ["/usr/local/bin/plenum-core"]
