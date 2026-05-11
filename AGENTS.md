# AGENTS.md — Plenum

OpenAPI-first API gateway built on Cloudflare's pingora HTTP framework (Rust). Configured entirely through OpenAPI specs with `x-plenum-*` extensions applied via OpenAPI Overlays. Interceptors and plugins run in out-of-process Node.js runtimes.

## Source layout

| Path | What |
|------|------|
| `plenum-core/src/` | Gateway binary — CLI, config loading, routing, proxying, interceptors, plugins, CORS, validation, load balancing, TLS, rate limiting |
| `plenum-config/src/` | Config parsing library — reads OpenAPI specs + overlays, resolves `x-plenum-*` extensions and `${{}}` template tokens |
| `plenum-js-runtime/` | Out-of-process Node.js runtime — Rust side (`src/`) spawns Node.js child process (`node-runtime/server.js`), communicates via Unix domain sockets with length-prefixed MessagePack |
| `plenum-js-runtime/node-runtime/` | Node.js server + built-in interceptors (add-header, auth-apikey, rate-limit-rejector, validate-request, validate-response) + plugins (mongodb, mysql, postgres, noop) |
| `openapi-overlay/` | OpenAPI Overlay spec implementation library (package name: `oapi-overlay`) |
| `plenum-sandbox/` | OS-level sandboxing — bubblewrap on Linux, env filtering on other platforms |
| `oas-query/` | OpenAPI 3.x query parameter deserialization with full style/explode support |
| `sdk/` | TypeScript types generated from Rust structs via `ts-rs` |
| `e2e/` | End-to-end test suite (TypeScript, Vitest, testcontainers) |
| `docs/` | Feature documentation (15 topics + plugin writing guide) |
| `examples/` | 17 runnable example projects, each with docker-compose and README |

## Key architectural concepts

**Routing:** `plenum-core/src/path_match/mod.rs`
Uses the `matchit` trie-based router. `build_router()` iterates OpenAPI paths, builds `RouteEntry` per path with `OperationSchemas` per HTTP method. OpenAPI `{param}` syntax maps directly to matchit. HEAD requests fall back to GET.

**Request lifecycle (pingora ProxyHttp):** `plenum-core/src/lib.rs`, `plenum-core/src/phases/`
The gateway implements pingora's `ProxyHttp` trait. Each phase of the lifecycle has its own submodule under `phases/`: `on_request_headers`, `on_request`, `before_upstream`, `on_response`, `gateway_error`, `upstream_peer`.

**Interceptors:** `plenum-core/src/interceptor/mod.rs` (types), `plenum-core/src/phases/` (execution), `plenum-js-runtime/` (JS runtime)
Five per-operation hooks run in order: `on_request_headers` → `on_request` → `before_upstream` → `on_response` → `on_response_body`. Each interceptor receives input (`RequestInput`/`ResponseInput`) and returns `InterceptorOutput::Continue` or `Respond` (short-circuit). A sixth global `on_gateway_error` hook catches gateway-generated errors (404, 502, 504). Interceptors are configured via `x-plenum-interceptor` extensions and resolved in `path_match/module_resolver.rs`.

**Plugins:** `plenum-core/src/upstream/mod.rs` (PluginHandle), `plenum-core/src/upstream_plugin/mod.rs` (dispatch)
Alternative to proxy upstreams. Plugins receive the full request via `PluginInput` and return `PluginOutput`. Dispatched from `upstream_plugin/mod.rs`. Configured via `x-plenum-upstream` with `kind: "plugin"`.

**Upstream types:** `plenum-core/src/config/upstreams.rs`, `plenum-core/src/upstream/`
- **HTTP** — single backend proxy
- **HTTP pool** — load-balanced backends (`plenum-core/src/load_balancing/`): RoundRobin, Weighted, Consistent hashing
- **Plugin** — Node.js handler
- **Static** — pre-built response

**Configuration model:** `plenum-config/src/parser.rs`
All config lives in the OpenAPI spec + overlays. Extensions use `x-plenum-` prefix. Boot-time interpolation with `${{ namespace.key }}` syntax (env vars, files, request context tokens). Overlays are applied sequentially. The `plenum-config` crate is framework-agnostic via the `RequestData` trait (`request_data.rs`).

**Context references:** `plenum-config/src/context_ref.rs`, `plenum-core/src/request_context/mod.rs`
`${{...}}` tokens are parsed at boot time into `ContextRef`s. Supported namespaces: `env`, `file`, `header`, `query`, `path-param`, `cookie`, `ctx`, `client-ip`, `path`, `method`, `body`. Runtime resolution happens per-request.

**Other subsystems:**
- Health checks: `plenum-core/src/health_check/` (active HTTP checks + passive failure tracking)
- Rate limiting: `plenum-core/src/rate_limit/` (per-operation, identifier-keyed)
- CORS: `plenum-core/src/cors/` (preflight handling + header injection)
- TLS: configured via `plenum-core/src/config/server.rs`, applied in peer construction (`upstream_peer/mod.rs`)
- Timeouts: `plenum-core/src/request_timeout/` (per-operation budget, applied to HttpPeer)
- Access logging: `plenum-core/src/access_log/` (templated, one line per request)
- Tracing: `plenum-core/src/tracing_setup/` (OTel OTLP gRPC export)
- Validation: built-in request/response validation against OpenAPI schemas (`openapi/operation.rs`)

## Entry points

- CLI: `plenum-core/src/main.rs` (clap, three flags: config-path, openapi-schema, openapi-overlay)
- Gateway construction: `plenum-core/src/lib.rs` (`build_gateway()` → pingora `Server`)
- Config loading: `plenum-config/src/parser.rs` (deserializes OpenAPI spec + applies overlays)
- Router building: `plenum-core/src/path_match/mod.rs` (`build_router()`)
- JS runtime bootstrap: `plenum-js-runtime/src/external.rs` (spawns Node.js, socket protocol)

## Where to find things

- **Docs:** `docs/quickstart.md` (getting started), other topics in `docs/` cover features one-to-one
- **Examples:** `examples/` — each subdirectory is a self-contained example with docker-compose
- **E2E tests:** `e2e/tests/` (36 test files, one per feature), fixtures in `e2e/fixtures/` (OpenAPI specs, overlays, interceptor scripts)
- **Rust tests:** alongside source (`#[cfg(test)]` modules), integration tests in `plenum-core/tests/`
- **CLAUDE.md:** comprehensive reference with build/test commands, config extension table, and detailed conventions

## Key conventions

- New modules in `plenum-core/src` use `{name}/mod.rs`, not `{name}.rs`
- Gateway proxying implements pingora's `ProxyHttp` trait
- Interceptors run in isolated Node.js processes with a permissions model (env vars, filesystem paths, network hosts)
- Route matching uses the `matchit` crate — OpenAPI path patterns work directly
- All new features require e2e test coverage
- Run `cargo fmt` and `cargo clippy` before commits
