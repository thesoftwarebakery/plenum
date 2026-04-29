# Plenum

API gateway that routes HTTP requests to upstreams based on an OpenAPI spec with `x-plenum-*` extensions. Built on [pingora](https://github.com/cloudflare/pingora).

## Workspace

Rust workspace (resolver v3, edition 2024) with four crates:

| Crate | Package name | Description |
|-------|-------------|-------------|
| `plenum-core` | `plenum-core` | Gateway binary — CLI, config parsing, routing, proxying |
| `openapi-overlay` | `oapi-overlay` | OpenAPI Overlay spec library (note: package name differs from dir name) |
| `plenum-js-runtime` | `plenum-js-runtime` | Out-of-process Node.js runtime for interceptors/plugins |
| `plenum-sandbox` | `plenum-sandbox` | OS-level sandboxing (bubblewrap on Linux, env filtering elsewhere) |

Additional directories:
- `sdk/` — TypeScript types generated from Rust via `ts-rs`
- `e2e/` — End-to-end test suite (TypeScript, Vitest, testcontainers)

## Build

```bash
cargo build                        # all crates (debug)
cargo build -p plenum-core         # gateway only
cargo build --release              # release build (LTO enabled)
```

### Docker

```bash
docker build -t plenum .           # multi-stage: node-runtime + cargo-chef + runtime
```

The Dockerfile uses `cargo-chef` for layer caching and produces a `node:22-bookworm-slim` based image with bubblewrap for sandboxing.

## Run

```bash
cargo run -p plenum-core -- \
  --config-path <dir> \
  --openapi-schema <file> \
  --openapi-overlay <overlay1>,<overlay2>
```

All CLI args have environment variable equivalents:
- `PLENUM_CONFIG_PATH` — base directory for resolving relative paths
- `PLENUM_OPENAPI_SCHEMA` — path to the OpenAPI spec (YAML/JSON)
- `PLENUM_OPENAPI_OVERLAYS` — comma-separated list of overlay files

The gateway listens on `0.0.0.0:6188` by default (configurable via `x-plenum-config.listen`).

## Tests

### Rust unit/integration tests

```bash
cargo test                         # all crates
cargo test -p plenum-core          # gateway only
cargo test -p oapi-overlay         # overlay library only (note: package name, not dir name)
```

Unit tests live alongside source code. Integration tests for `plenum-core` are in `plenum-core/tests/`.

### E2E tests

E2E tests are TypeScript + Vitest using testcontainers. They require Docker running.

```bash
cd e2e
pnpm install
pnpm test                          # runs pretest (build:types + build:fixtures) then vitest
```

Key details:
- **Gateway**: built from root `Dockerfile`, run as a container on port 6188 (HTTP) / 6189 (HTTPS)
- **HTTP upstreams**: WireMock containers configured via admin API
- **DB upstreams**: PostgreSQL, MySQL, MongoDB via testcontainers
- **Fixtures**: OpenAPI specs and overlays in `e2e/fixtures/`
- **Interceptor fixtures**: TypeScript files in `e2e/fixtures/interceptors/`, compiled to JS by `pretest`
- **Container helpers**: `e2e/src/containers/` (gateway, wiremock, https-upstream)
- **Test helpers**: `e2e/src/helpers/` (WireMockClient for stub management)
- **Vitest config**: 180s test timeout, max 3 parallel workers (forks), pattern `tests/**/*_test.ts`
- **TLS certs**: Auto-generated per run via `e2e/src/certs.ts` (CA, gateway, upstream)

**All new features and changes must include e2e test coverage.**

### Linting and formatting

```bash
cargo fmt --check                  # check formatting
cargo clippy                      # lint
```

Run `cargo fmt` and `cargo clippy` before every commit.

## Configuration model

Plenum is configured entirely through the OpenAPI spec + overlays. No separate config files.

### Extensions

All extensions use the `x-plenum-` prefix. The `oas3` crate strips the `x-` prefix when parsing, so in Rust code, keys are accessed as `"plenum-config"`, `"plenum-upstream"`, etc.

| Extension | Level | Purpose |
|-----------|-------|---------|
| `x-plenum-config` | Spec root | Server settings (threads, listen, TLS, timeouts, body limits) |
| `x-plenum-upstream` | Path item | Upstream target (HTTP, HTTP pool, plugin, static) |
| `x-plenum-interceptor` | Operation | JS interceptor chain (array of hook configs) |
| `x-plenum-cors` | Operation | CORS configuration |
| `x-plenum-backend` | Operation | Opaque config passed to plugin `handle()` |
| `x-plenum-request-timeout` | Operation | Per-operation request timeout (ms) |
| `x-plenum-max-request-body-bytes` | Operation | Per-operation max body size |
| `x-plenum-validation` | Operation | Request/response validation control |

### Upstream types

- **HTTP** — single backend proxy (`kind: "HTTP"`, `address`, `port`, `tls`, `tls-verify`)
- **HTTP pool** — load-balanced backends (`kind: "HTTP"`, `backends[]`, `selection`, `health-check`)
  - Selection: `round-robin` (default), `weighted`, `consistent`
  - `hash-key` supports `${{header.*}}`, `${{query.*}}`, `${{path-param.*}}`, `${{cookie.*}}`, `${{client-ip}}`
- **Plugin** — Node.js handler (`kind: "plugin"`, `plugin`, `options`, `permissions`, `timeout-ms`)
- **Static** — pre-built response (`kind: "static"`, `status`, `headers`, `body`)

### Interceptor lifecycle hooks (execution order)

1. `on_request_headers` — headers only, can short-circuit
2. `on_request` — full body available, can short-circuit
3. `before_upstream` — modify upstream request headers
4. `on_response` — modify response headers
5. `on_response_body` — transform response body (requires `buffer-response: true` on upstream)

### Config resolution

- `Config::extension()` handles `$ref` resolution automatically
- Environment variable substitution: `${VAR}` and `${VAR:-default}` in string values
- Overlays are applied sequentially in the order specified

## Key conventions

- New modules in `plenum-core/src` must use `{name}/mod.rs` pattern, not `{name}.rs`
- Path matching uses `matchit` crate — OpenAPI `{param}` syntax works directly, no conversion needed
- Gateway proxying implements pingora's `ProxyHttp` trait (`plenum-core/src/lib.rs`)
- Interceptors run in isolated Node.js processes via `plenum-js-runtime`
- Permissions model: `env` (env var names), `read` (filesystem paths), `net` (hostnames)
- Request context tokens (`${{...}}`) are parsed by `request_context/mod.rs`
- Refer to `e2e/fixtures/` for canonical examples of every config pattern
