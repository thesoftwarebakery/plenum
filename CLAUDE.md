# OpenGateway

API gateway that routes HTTP requests to upstreams based on an OpenAPI spec with extensions.

## Project structure

Rust workspace with two crates:
- `gateway-core` — the gateway binary (config parsing, routing, proxying via pingora)
- `openapi-overlay` — library for applying OpenAPI Overlay spec to OpenAPI documents

## Build & test

```bash
cargo build          # build all crates
cargo test           # run all tests
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

## E2E tests

E2E tests are written in TypeScript and run with Deno. They live in `e2e/` and use testcontainers to manage Docker containers for the gateway and its upstreams.

- **Gateway**: built from the root `Dockerfile` and run as a container
- **HTTP upstreams**: wiremock containers, configured via the wiremock admin API
- **DB upstreams**: dockerised databases via testcontainers (when implemented)
- **Fixtures**: OpenAPI specs and overlays in `e2e/fixtures/`
- **Container helpers**: reusable setup in `e2e/src/containers/`

```bash
cd e2e && DOCKER_HOST=unix:///var/run/docker.sock deno test --allow-net --allow-read --allow-env --allow-run --allow-sys --allow-write tests/
```

**All new features and changes must include e2e test coverage.** Rust unit/integration tests in `gateway-core/tests/` complement the e2e suite by testing library internals directly.

## Key conventions

- OpenAPI extensions use `x-opengateway-` prefix (oas3 strips `x-` when parsing, so code uses keys like `"opengateway-config"`)
- Config resolution uses `Config::extension()` which handles `$ref` resolution automatically
- Path matching uses `matchit` crate — OpenAPI `{param}` syntax works directly, no conversion needed
- Gateway proxying uses pingora's `ProxyHttp` trait
