# Plenum

An OpenAPI-first API gateway and reverse proxy.

## Vision

Plenum uses an OpenAPI specification as the single source of truth for all gateway configuration. Extensions (applied via [OpenAPI Overlay](https://github.com/OAI/Overlay-Specification)) configure routing, upstreams, validation, and behaviour — no separate gateway config files.

### Core principles

- **OpenAPI as source of truth** — routing, upstream mapping, validation rules, and interceptor registration are all defined in the OpenAPI spec via `x-plenum-*` extensions
- **Multiple upstream types** — starting with HTTP/HTTPS reverse proxying, expanding to direct database connections (building on [openapi-db](https://github.com/thesoftwarebakery/openapi-db)) where the gateway generates and executes queries directly
- **Programmable behaviour** — JS modules executed via an embedded [Deno](https://deno.com/) runtime (`deno_core`) allow users to register interceptors at various points in the request lifecycle, configured per-path, per-operation, or globally
- **Request/response validation** — request and response validation against OpenAPI schemas is enabled by default, overridable at global, per-route, or per-route+method levels. Non-2xx upstream responses get sensible default error handling, also configurable at the same granularity

## Project structure

Rust workspace with two crates:

- **`plenum-core`** — the gateway binary (config parsing, routing, proxying via [pingora](https://github.com/cloudflare/pingora))
- **`openapi-overlay`** — library for applying the [OpenAPI Overlay specification](https://github.com/OAI/Overlay-Specification) to OpenAPI documents (independently publishable)

## Build & test

```bash
cargo build                       # build all crates
cargo test                        # run all tests
cargo test -p plenum-core        # test gateway only
cargo test -p oapi-overlay        # test overlay library only
```

## Running

```bash
cargo run -p plenum-core -- \
  --config-path <dir> \
  --openapi-schema <file> \
  --openapi-overlay <overlay1>,<overlay2>
```

Environment variables: `PLENUM_CONFIG_PATH`, `PLENUM_OPENAPI_SCHEMA`, `PLENUM_OPENAPI_OVERLAYS`

## Current status

The core routing and HTTP proxying pipeline is functional:

- OpenAPI spec parsing with extension resolution and `$ref` support
- Overlay application for configuration injection
- Path-based request routing (including parameterised paths)
- HTTP/HTTPS reverse proxying via pingora

See [issues](https://github.com/thesoftwarebakery/plenum/issues) for planned work.
