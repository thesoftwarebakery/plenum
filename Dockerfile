FROM rust:1.85-bookworm AS builder

RUN apt-get update && apt-get install -y cmake

WORKDIR /usr/src/opengateway

COPY Cargo.toml Cargo.lock ./
COPY gateway-core/ gateway-core/
COPY openapi-overlay/ openapi-overlay/

RUN cargo build --release -p gateway-core

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/opengateway/target/release/gateway-core /usr/local/bin/gateway-core

ENTRYPOINT ["/usr/local/bin/gateway-core"]
