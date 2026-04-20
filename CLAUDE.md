# Plenum

API gateway that routes HTTP requests to upstreams based on an OpenAPI spec with extensions.

## Project structure

Rust workspace with two crates:
- `plenum-core` — the gateway binary (config parsing, routing, proxying via pingora)
- `openapi-overlay` — library for applying OpenAPI Overlay spec to OpenAPI documents

## Build & test

```bash
cargo build          # build all crates
cargo test           # run all tests
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

## E2E tests

E2E tests are written in TypeScript and run with Node.js + Vitest. They live in `e2e/` and use testcontainers to manage Docker containers for the gateway and its upstreams.

- **Gateway**: built from the root `Dockerfile` and run as a container
- **HTTP upstreams**: wiremock containers, configured via the wiremock admin API
- **DB upstreams**: dockerised databases via testcontainers (when implemented)
- **Fixtures**: OpenAPI specs and overlays in `e2e/fixtures/`
- **Container helpers**: reusable setup in `e2e/src/containers/`

```bash
cd e2e && npm test
```

**All new features and changes must include e2e test coverage.** Rust unit/integration tests in `plenum-core/tests/` complement the e2e suite by testing library internals directly.

## Key conventions

- OpenAPI extensions use `x-plenum-` prefix (oas3 strips `x-` when parsing, so code uses keys like `"plenum-config"`)
- Config resolution uses `Config::extension()` which handles `$ref` resolution automatically
- Path matching uses `matchit` crate — OpenAPI `{param}` syntax works directly, no conversion needed
- Gateway proxying uses pingora's `ProxyHttp` trait
