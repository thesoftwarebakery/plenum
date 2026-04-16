# OpenGateway

An OpenAPI-first API gateway and reverse proxy.

## Vision

OpenGateway uses an OpenAPI specification as the single source of truth for all gateway configuration. Extensions (applied via [OpenAPI Overlay](https://github.com/OAI/Overlay-Specification)) configure routing, upstreams, validation, and behaviour — no separate gateway config files.

### Core principles

- **OpenAPI as source of truth** — routing, upstream mapping, validation rules, and interceptor registration are all defined in the OpenAPI spec via `x-opengateway-*` extensions
- **Multiple upstream types** — starting with HTTP/HTTPS reverse proxying, expanding to direct database connections (building on [openapi-db](https://github.com/thesoftwarebakery/openapi-db)) where the gateway generates and executes queries directly
- **Programmable behaviour** — JS modules executed via an embedded [Deno](https://deno.com/) runtime (`deno_core`) allow users to register interceptors at various points in the request lifecycle, configured per-path, per-operation, or globally
- **Request/response validation** — request and response validation against OpenAPI schemas is enabled by default, overridable at global, per-route, or per-route+method levels. Non-2xx upstream responses get sensible default error handling, also configurable at the same granularity

## Project structure

Rust workspace with two crates:

- **`gateway-core`** — the gateway binary (config parsing, routing, proxying via [pingora](https://github.com/cloudflare/pingora))
- **`openapi-overlay`** — library for applying the [OpenAPI Overlay specification](https://github.com/OAI/Overlay-Specification) to OpenAPI documents (independently publishable)

## Build & test

```bash
cargo build                       # build all crates
cargo test                        # run all tests
cargo test -p gateway-core        # test gateway only
cargo test -p oapi-overlay        # test overlay library only
```

## Running

```bash
cargo run -p gateway-core -- \
  --config-path <dir> \
  --openapi-schema <file> \
  --openapi-overlay <overlay1>,<overlay2>
```

Environment variables: `OPENGATEWAY_CONFIG_PATH`, `OPENGATEWAY_OPENAPI_SCHEMA`, `OPENGATEWAY_OPENAPI_OVERLAYS`

## Current status

The core routing and HTTP proxying pipeline is functional:

- OpenAPI spec parsing with extension resolution and `$ref` support
- Overlay application for configuration injection
- Path-based request routing (including parameterised paths)
- HTTP/HTTPS reverse proxying via pingora
- JS interceptors with configurable hooks, timeouts, and permissions
- Request/response validation against OpenAPI schemas

### Database plugins (in development)

Built-in database plugins (PostgreSQL, MySQL, MongoDB) let you define SQL/NoSQL queries directly in your OpenAPI spec. The plugin code, query interpolation engine, response shaping, and e2e tests are all implemented.

**Status:** Blocked by a runtime limitation — the embedded `deno_core` JS runtime does not yet support TCP sockets, which database drivers require. See [docs/db-plugins.md](docs/db-plugins.md) for full documentation and details on the blocker.

See [issues](https://github.com/thesoftwarebakery/opengateway/issues) for planned work.
