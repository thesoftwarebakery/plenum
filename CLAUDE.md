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

## Key conventions

- OpenAPI extensions use `x-opengateway-` prefix (oas3 strips `x-` when parsing, so code uses keys like `"opengateway-config"`)
- Config resolution uses `Config::extension()` which handles `$ref` resolution automatically
- Path matching uses `matchit` crate — OpenAPI `{param}` syntax works directly, no conversion needed
- Gateway proxying uses pingora's `ProxyHttp` trait
