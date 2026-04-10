# Interceptor Config Redesign

**Date:** 2026-04-08
**Branch:** feat/request-response-body-interceptors

## Summary

Replace the current grouped interceptor config (one object per operation with a `hooks` list) with a flat array model where each entry is a self-contained interceptor: one module, one function, one hook phase, one optional timeout. Remove all hardcoded function names and the hardcoded timeout constant from the Rust call sites.

## Motivation

The current `InterceptorConfig` struct encodes hooks by module file, implicitly mapping hook names (`on_request`) to JS function names (`onRequest`) via convention. This means:

- Function names are not configurable -- they are hardcoded at each call site in `lib.rs`
- A single timeout constant (`INTERCEPTOR_TIMEOUT = 30s`) applies to every hook
- Only one module can be associated with an operation's interceptor config
- Multiple interceptors per hook phase are not possible

The array model removes all of these limitations and is consistent with how upstreams are already configured (named definitions + `$ref` for reuse).

## Config Schema

### `x-opengateway-config` (global default timeout)

`ServerConfig` gains one new optional field:

```rust
pub struct ServerConfig {
    pub threads: usize,
    pub daemon: bool,
    pub listen: String,
    pub interceptor_default_timeout_ms: Option<u64>,  // falls back to 30000
}
```

Example:
```yaml
x-opengateway-config:
  threads: 1
  listen: "0.0.0.0:6188"
  interceptor_default_timeout_ms: 10000
```

### `x-opengateway-interceptor` (per-operation)

Changes from a single object to an array. Each entry is fully explicit -- no defaulting of function names.

```rust
#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,       // path relative to config_base
    pub hook: String,         // "on_request" | "before_upstream" | "on_response" | "on_response_body"
    pub function: String,     // JS function name to call -- mandatory, no default
    pub timeout_ms: Option<u64>,  // overrides global default if set
}
```

Example:
```yaml
x-opengateway-interceptor:
  - module: "./interceptors/auth.js"
    hook: on_request
    function: checkAuth
    timeout_ms: 2000
  - module: "./interceptors/logging.js"
    hook: on_request
    function: logRequest
  - module: "./interceptors/transform.js"
    hook: on_response
    function: transformResponse
```

Reuse across operations is handled via `$ref` into a shared definitions block, consistent with the existing upstream pattern.

Timeout resolution order: `interceptor.timeout_ms` -> `server_config.interceptor_default_timeout_ms` -> `30000ms` hardcoded fallback.

## Data Structures

### `HookHandle` (new)

Bundles everything needed at call time. Resolved once at startup.

```rust
pub struct HookHandle {
    pub runtime: Arc<JsRuntimeHandle>,
    pub function: String,
    pub timeout: Duration,
}
```

### `OperationInterceptors` (updated)

Fields change from `Option<Arc<JsRuntimeHandle>>` to `Vec<HookHandle>`. An empty vec means no interceptors for that phase. Array order is preserved as execution order.

```rust
pub struct OperationInterceptors {
    pub on_request: Vec<HookHandle>,
    pub before_upstream: Vec<HookHandle>,
    pub on_response: Vec<HookHandle>,
    pub on_response_body: Vec<HookHandle>,
}
```

## Call Sites

Each hook phase in `lib.rs` iterates over the vec and stops on the first error:

```rust
for hook in &interceptors.on_request {
    call_interceptor(&hook.runtime, &hook.function, ..., hook.timeout).await?;
}
```

The hardcoded `INTERCEPTOR_TIMEOUT` constant and all hardcoded function name strings (`"onRequest"`, `"beforeUpstream"`, `"onResponse"`, `"onResponseBody"`) are removed entirely.

**Error behaviour:** if any interceptor in the chain returns an error, the chain halts and the request fails. Subsequent interceptors in the same phase do not run.

## Validation

At startup (path-match build time), unknown `hook` values are rejected with a clear error message. Valid values: `on_request`, `before_upstream`, `on_response`, `on_response_body`.

## Baseline

Before starting any implementation work, run the full test suite (Rust unit/integration tests and e2e tests) and record the results. This establishes a known baseline: any test that was already failing before the work started is not a regression, and any new failure introduced during implementation is clearly attributable to this change.

```bash
cargo test
cd e2e && deno task test
```

## Testing

**Rust unit/integration tests (`gateway-core/tests/`):**
- Timeout resolution: global default, per-interceptor override, fallback to 30s
- Startup validation: unknown `hook` value produces a clear error

**E2E tests (`e2e/`):**
- Update all existing interceptor fixtures and overlays to the new array config shape
- New scenario: two interceptors on the same hook phase -- verify both run in order and the second sees output from the first
- New scenario: per-interceptor `timeout_ms` override -- verify it is respected
