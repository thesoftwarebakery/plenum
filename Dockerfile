FROM node:22-bookworm-slim AS node-runtime-builder

WORKDIR /usr/src/opengateway/node-runtime
COPY opengateway-js-runtime/node-runtime/package.json opengateway-js-runtime/node-runtime/package-lock.json ./
RUN npm ci --omit=dev
COPY opengateway-js-runtime/node-runtime/ ./

FROM rust:1.93-bookworm AS chef

RUN apt-get update && apt-get install -y cmake
RUN cargo install cargo-chef

WORKDIR /usr/src/opengateway

FROM chef AS planner

COPY Cargo.toml Cargo.lock ./
COPY gateway-core/ gateway-core/
COPY openapi-overlay/ openapi-overlay/
COPY opengateway-js-runtime/ opengateway-js-runtime/
COPY opengateway-sandbox/ opengateway-sandbox/
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

COPY --from=planner /usr/src/opengateway/recipe.json recipe.json

# Cook dependencies only -- this layer is cached until Cargo.toml/Cargo.lock change.
RUN cargo chef cook --release --recipe-path recipe.json -p gateway-core

COPY Cargo.toml Cargo.lock ./
COPY gateway-core/ gateway-core/
COPY openapi-overlay/ openapi-overlay/
COPY opengateway-js-runtime/ opengateway-js-runtime/
COPY opengateway-sandbox/ opengateway-sandbox/

RUN cargo build --release -p gateway-core

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/opengateway/target/release/gateway-core /usr/local/bin/gateway-core
# Place node-runtime alongside the binary so locate_server_script() finds it.
COPY --from=node-runtime-builder /usr/src/opengateway/node-runtime /usr/local/bin/node-runtime

ENTRYPOINT ["/usr/local/bin/gateway-core"]
