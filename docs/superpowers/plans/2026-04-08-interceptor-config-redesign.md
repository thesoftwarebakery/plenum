# Interceptor Config Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grouped `x-plenum-interceptor` config with a flat array model where each entry specifies one module, one JS function, one hook phase, and an optional timeout -- removing all hardcoded function names and the global timeout constant.

**Architecture:** Each interceptor entry in the array is deserialized into an `InterceptorConfig` struct and resolved into a `HookHandle` (runtime + function + timeout) at startup. `OperationInterceptors` holds `Vec<HookHandle>` per hook phase; call sites iterate the vec and stop on error. Timeout resolution: per-interceptor `timeout_ms` -> `x-plenum-config.interceptor_default_timeout_ms` -> 30000ms fallback.

**Tech Stack:** Rust (serde_json, serde), Deno/TypeScript (e2e), testcontainers, wiremock

---

## File Map

| File | Change |
|---|---|
| `plenum-core/src/config/interceptor.rs` | Replace `hooks: Vec<String>` with `hook`, `function`, `timeout_ms` fields |
| `plenum-core/src/config/server.rs` | Add `interceptor_default_timeout_ms: Option<u64>` |
| `plenum-core/src/path_match/mod.rs` | Add `HookHandle`; `OperationInterceptors` fields -> `Vec<HookHandle>`; rewrite `build_operation_interceptors`; parse `ServerConfig` for default timeout |
| `plenum-core/src/lib.rs` | Remove `INTERCEPTOR_TIMEOUT`; add `timeout: Duration` param to helpers; iterate vecs at all four hook phases |
| `e2e/fixtures/overlay-interceptor-add-header.yaml` | Convert to array format (updated in Task 2 for unit test) |
| `e2e/fixtures/overlay-interceptor-{all-hooks,block,block-by-body,...}.yaml` | Convert remaining 13 overlays to array format |
| `e2e/fixtures/interceptors/chain-first.js` | New: exports `addFirst` |
| `e2e/fixtures/interceptors/chain-second.js` | New: exports `addSecond` |
| `e2e/fixtures/overlay-interceptor-chain.yaml` | New: two `on_request` interceptors |
| `e2e/tests/interceptor_chain_test.ts` | New: verifies both chained interceptors fire |

---

## Task 0: Establish baseline

**Files:** none modified

- [ ] **Step 1: Run Rust tests**

```bash
cargo test
```

Record all passing/failing tests. Any failures here are pre-existing and not regressions.

- [ ] **Step 2: Run e2e tests**

```bash
cd e2e && deno task test
```

Record all passing/failing tests.

---

## Task 1: Add `interceptor_default_timeout_ms` to `ServerConfig`

**Files:**
- Modify: `plenum-core/src/config/server.rs`

- [ ] **Step 1: Write failing tests**

Add to the `#[cfg(test)]` block in `plenum-core/src/config/server.rs`:

```rust
#[test]
fn deserializes_interceptor_default_timeout_ms() {
    let json = serde_json::json!({
        "interceptor_default_timeout_ms": 5000
    });
    let config: ServerConfig = serde_json::from_value(json).unwrap();
    assert_eq!(config.interceptor_default_timeout_ms, Some(5000));
}

#[test]
fn interceptor_default_timeout_ms_defaults_to_none() {
    let json = serde_json::json!({});
    let config: ServerConfig = serde_json::from_value(json).unwrap();
    assert_eq!(config.interceptor_default_timeout_ms, None);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cargo test -p plenum-core config::server
```

Expected: FAIL with "no field `interceptor_default_timeout_ms`" or similar.

- [ ] **Step 3: Add field to `ServerConfig`**

Replace the full contents of `plenum-core/src/config/server.rs`:

```rust
use serde::Deserialize;

fn default_threads() -> usize { 1 }
fn default_listen() -> String { "0.0.0.0:6188".to_string() }

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_threads")]
    pub threads: usize,
    #[serde(default)]
    pub daemon: bool,
    #[serde(default = "default_listen")]
    pub listen: String,
    #[serde(default)]
    pub interceptor_default_timeout_ms: Option<u64>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            threads: default_threads(),
            daemon: false,
            listen: default_listen(),
            interceptor_default_timeout_ms: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_full_config() {
        let json = serde_json::json!({
            "threads": 4,
            "daemon": true,
            "listen": "127.0.0.1:8080",
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.threads, 4);
        assert!(config.daemon);
        assert_eq!(config.listen, "127.0.0.1:8080");
    }

    #[test]
    fn uses_defaults_when_fields_missing() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.threads, 1);
        assert!(!config.daemon);
        assert_eq!(config.listen, "0.0.0.0:6188");
    }

    #[test]
    fn default_trait_matches_serde_defaults() {
        let config = ServerConfig::default();
        assert_eq!(config.threads, 1);
        assert!(!config.daemon);
        assert_eq!(config.listen, "0.0.0.0:6188");
    }

    #[test]
    fn deserializes_interceptor_default_timeout_ms() {
        let json = serde_json::json!({
            "interceptor_default_timeout_ms": 5000
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.interceptor_default_timeout_ms, Some(5000));
    }

    #[test]
    fn interceptor_default_timeout_ms_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.interceptor_default_timeout_ms, None);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p plenum-core config::server
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plenum-core/src/config/server.rs
git commit -m "feat(config): add interceptor_default_timeout_ms to ServerConfig"
```

---

## Task 2: Restructure interceptor config, path_match, and lib.rs (atomic)

This task changes four files and one fixture. All must be updated together because `InterceptorConfig` changes break `path_match/mod.rs`, which in turn breaks `lib.rs`. The code will not compile until all sub-steps are done.

**Files:**
- Modify: `plenum-core/src/config/interceptor.rs`
- Modify: `plenum-core/src/path_match/mod.rs`
- Modify: `plenum-core/src/lib.rs`
- Modify: `e2e/fixtures/overlay-interceptor-add-header.yaml` (required for unit test in step 2b)

### Step 2a: Update `InterceptorConfig`

- [ ] **Step 2a-1: Write failing unit test for new struct shape**

Add to `plenum-core/src/config/interceptor.rs` below the existing struct:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_flat_interceptor_config() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "timeout_ms": 2000
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.module, "./interceptors/auth.js");
        assert_eq!(config.hook, "on_request");
        assert_eq!(config.function, "checkAuth");
        assert_eq!(config.timeout_ms, Some(2000));
    }

    #[test]
    fn timeout_ms_is_optional() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth"
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.timeout_ms, None);
    }
}
```

- [ ] **Step 2a-2: Replace `InterceptorConfig` struct**

Replace the full contents of `plenum-core/src/config/interceptor.rs`:

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,
    pub hook: String,
    pub function: String,
    pub timeout_ms: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_flat_interceptor_config() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "timeout_ms": 2000
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.module, "./interceptors/auth.js");
        assert_eq!(config.hook, "on_request");
        assert_eq!(config.function, "checkAuth");
        assert_eq!(config.timeout_ms, Some(2000));
    }

    #[test]
    fn timeout_ms_is_optional() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth"
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.timeout_ms, None);
    }
}
```

The code will not compile yet -- `path_match/mod.rs` accesses `interceptor_config.hooks` which no longer exists. Proceed to step 2b.

### Step 2b: Update `path_match/mod.rs`

- [ ] **Step 2b-1: Update `overlay-interceptor-add-header.yaml`** (needed by unit test below)

Replace the full contents of `e2e/fixtures/overlay-interceptor-add-header.yaml`:

```yaml
overlay: 1.1.0
info:
  title: Attach add-header interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/add-header.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 2b-2: Replace `plenum-core/src/path_match/mod.rs`**

Replace the full file:

```rust
use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use http::Method;
use oas3::spec::{Operation, PathItem, Spec};
use matchit::Router;
use plenum_js_runtime::JsRuntimeHandle;
use pingora_core::upstreams::peer::HttpPeer;

use crate::config::{Config, InterceptorConfig, ServerConfig, UpstreamConfig, ValidationOverride};
use crate::upstream_http::make_peer;
use crate::validation::schema::CompiledSchema;

/// A resolved interceptor hook: runtime handle, JS function name, and call timeout.
pub struct HookHandle {
    pub runtime: Arc<JsRuntimeHandle>,
    pub function: String,
    pub timeout: Duration,
}

/// JS interceptor handles for a single operation, one per lifecycle hook.
/// Each vec preserves the array order from the config, which is the execution order.
#[derive(Default)]
pub struct OperationInterceptors {
    pub on_request: Vec<HookHandle>,
    pub before_upstream: Vec<HookHandle>,
    pub on_response: Vec<HookHandle>,
    pub on_response_body: Vec<HookHandle>,
}

/// Compiled schemas for a single operation (method on a path).
pub struct OperationSchemas {
    pub request_body: Option<CompiledSchema>,
    pub responses: HashMap<u16, CompiledSchema>,
    pub default_response: Option<CompiledSchema>,
    pub validation_override: Option<ValidationOverride>,
    pub interceptors: OperationInterceptors,
}

/// A route entry stored in the router, containing the upstream peer
/// and per-operation schema information for validation.
pub struct RouteEntry {
    pub peer: HttpPeer,
    pub operations: HashMap<Method, OperationSchemas>,
    pub validation_override: Option<ValidationOverride>,
}

pub type PlenumRouter = Router<Arc<RouteEntry>>;

/// Try to compile the JSON schema from an operation's request body (application/json only).
fn compile_request_body_schema(operation: &Operation, spec: &Spec) -> Option<CompiledSchema> {
    let req_body = operation.request_body(spec).ok()??;
    let media_type = req_body.content.get("application/json")?;
    let schema = media_type.schema(spec).ok()??;
    let value = serde_json::to_value(&schema).ok()?;
    CompiledSchema::compile(&value).ok()
}

/// Compile JSON schemas from an operation's responses, keyed by status code.
fn compile_response_schemas(
    operation: &Operation,
    spec: &Spec,
) -> (HashMap<u16, CompiledSchema>, Option<CompiledSchema>) {
    let mut responses = HashMap::new();
    let mut default_response = None;

    for (status_key, response) in operation.responses(spec) {
        let Some(media_type) = response.content.get("application/json") else {
            continue;
        };
        let Some(schema) = media_type.schema(spec).ok().flatten() else {
            continue;
        };
        let Some(value) = serde_json::to_value(&schema).ok() else {
            continue;
        };
        let Some(compiled) = CompiledSchema::compile(&value).ok() else {
            continue;
        };

        if status_key == "default" {
            default_response = Some(compiled);
        } else if let Ok(code) = status_key.parse::<u16>() {
            responses.insert(code, compiled);
        }
    }

    (responses, default_response)
}

/// Parse an operation's `x-plenum-interceptor` extension and build interceptor handles.
fn build_operation_interceptors(
    operation: &Operation,
    config_base: &Path,
    runtime_cache: &mut HashMap<PathBuf, Arc<JsRuntimeHandle>>,
    default_timeout: Duration,
) -> Result<OperationInterceptors, Box<dyn Error>> {
    let interceptor_value = match operation.extensions.get("plenum-interceptor") {
        Some(v) => v,
        None => return Ok(OperationInterceptors::default()),
    };

    let interceptor_configs: Vec<InterceptorConfig> = serde_json::from_value(interceptor_value.clone())?;

    let mut interceptors = OperationInterceptors::default();
    for config in &interceptor_configs {
        let module_path = config_base.join(&config.module);
        let canonical = module_path.canonicalize().map_err(|e| {
            format!(
                "interceptor module '{}' not found (resolved to '{}'): {e}",
                config.module,
                module_path.display()
            )
        })?;

        // Deduplicate: reuse handle if this module was already spawned.
        let runtime = match runtime_cache.entry(canonical) {
            std::collections::hash_map::Entry::Occupied(e) => e.get().clone(),
            std::collections::hash_map::Entry::Vacant(e) => {
                let h = Arc::new(plenum_js_runtime::spawn_runtime_sync(e.key())?);
                e.insert(h).clone()
            }
        };

        let timeout = config.timeout_ms
            .map(Duration::from_millis)
            .unwrap_or(default_timeout);

        let hook_handle = HookHandle { runtime, function: config.function.clone(), timeout };

        match config.hook.as_str() {
            "on_request" => interceptors.on_request.push(hook_handle),
            "before_upstream" => interceptors.before_upstream.push(hook_handle),
            "on_response" => interceptors.on_response.push(hook_handle),
            "on_response_body" => interceptors.on_response_body.push(hook_handle),
            other => {
                return Err(format!("unknown interceptor hook: '{other}'").into());
            }
        }
    }

    Ok(interceptors)
}

pub fn build_router(
    config: &Config,
    paths: &BTreeMap<String, PathItem>,
    config_base: &Path,
) -> Result<PlenumRouter, Box<dyn Error>> {
    let server_config: ServerConfig = config
        .extension(&config.spec.extensions, "plenum-config")
        .unwrap_or_else(|_| ServerConfig::default());
    let default_interceptor_timeout = Duration::from_millis(
        server_config.interceptor_default_timeout_ms.unwrap_or(30_000)
    );

    let mut router = Router::new();
    let mut runtime_cache: HashMap<PathBuf, Arc<JsRuntimeHandle>> = HashMap::new();

    for (path, path_item) in paths {
        let upstream: UpstreamConfig = config.extension(&path_item.extensions, "plenum-upstream")?;
        let peer = make_peer(&upstream);

        // Path-level validation override
        let path_validation: Option<ValidationOverride> = config
            .extension(&path_item.extensions, "plenum-validation")
            .ok();

        // Build operation schemas for each method on this path
        let mut operations = HashMap::new();
        for (method, operation) in path_item.methods() {
            let request_body = compile_request_body_schema(operation, &config.spec);
            let (responses, default_response) = compile_response_schemas(operation, &config.spec);

            // Operation-level validation override
            let op_validation: Option<ValidationOverride> = operation
                .extensions
                .get("plenum-validation")
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            // Operation-level interceptors
            let interceptors = build_operation_interceptors(
                operation,
                config_base,
                &mut runtime_cache,
                default_interceptor_timeout,
            )?;

            operations.insert(method, OperationSchemas {
                request_body,
                responses,
                default_response,
                validation_override: op_validation,
                interceptors,
            });
        }

        let entry = Arc::new(RouteEntry {
            peer,
            operations,
            validation_override: path_validation,
        });
        router.insert(path, entry)?;
    }
    Ok(router)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use serde_json::json;

    fn fixture_path(name: &str) -> String {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
            .to_string_lossy()
            .to_string()
    }

    fn config_with_schema() -> Config {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "post": {
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "name": { "type": "string" }
                                        },
                                        "required": ["name"]
                                    }
                                }
                            }
                        },
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {
                                                "id": { "type": "string" }
                                            },
                                            "required": ["id"]
                                        }
                                    }
                                }
                            },
                            "default": {
                                "description": "error",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {
                                                "error": { "type": "string" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "get": {
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        Config::from_value(doc).unwrap()
    }

    fn dummy_config_base() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    #[test]
    fn extracts_request_body_schema() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let post = matched.value.operations.get(&Method::POST).unwrap();
        assert!(post.request_body.is_some());
    }

    #[test]
    fn extracts_response_schema_by_status() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let post = matched.value.operations.get(&Method::POST).unwrap();
        assert!(post.responses.contains_key(&200));
        assert!(post.default_response.is_some());
    }

    #[test]
    fn no_schema_for_operations_without_body() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert!(get.request_body.is_none());
        assert!(get.responses.is_empty());
    }

    #[test]
    fn validates_extracted_request_schema() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let post = matched.value.operations.get(&Method::POST).unwrap();
        let schema = post.request_body.as_ref().unwrap();

        // Valid
        assert!(schema.validate(&json!({"name": "test"})).is_ok());
        // Missing required field
        assert!(schema.validate(&json!({})).is_err());
    }

    #[test]
    fn operations_without_interceptor_have_empty_vecs() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert!(get.interceptors.on_request.is_empty());
        assert!(get.interceptors.before_upstream.is_empty());
        assert!(get.interceptors.on_response.is_empty());
    }

    #[test]
    fn parses_interceptor_config_and_spawns_runtime() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        // Use "/" as config_base since module path is absolute
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request.len(), 1);
        assert_eq!(get.interceptors.on_request[0].function, "onRequest");
        assert!(get.interceptors.before_upstream.is_empty());
        assert!(get.interceptors.on_response.is_empty());
    }

    #[test]
    fn supports_multiple_interceptors_per_hook_phase() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [
                            {
                                "module": &noop_path,
                                "hook": "on_request",
                                "function": "onRequest"
                            },
                            {
                                "module": &noop_path,
                                "hook": "on_request",
                                "function": "onRequest"
                            }
                        ],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request.len(), 2);
    }

    #[test]
    fn rejects_unknown_hook_name() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "invalid_hook",
                            "function": "someFunction"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, Path::new("/"));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown interceptor hook"), "expected error mentioning unknown hook, got: {}", err);
    }

    #[test]
    fn resolves_per_interceptor_timeout() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest",
                            "timeout_ms": 5000
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request[0].timeout, Duration::from_millis(5000));
    }

    #[test]
    fn falls_back_to_global_server_config_timeout() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-plenum-config": { "interceptor_default_timeout_ms": 15000 },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request[0].timeout, Duration::from_millis(15000));
    }

    #[test]
    fn falls_back_to_hardcoded_default_when_no_config() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request[0].timeout, Duration::from_millis(30_000));
    }

    #[test]
    fn overlay_applies_interceptor_extension() {
        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap()
            .join("e2e").join("fixtures");

        let yaml = std::fs::read_to_string(fixtures.join("openapi-interceptor.yaml")).unwrap();
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml).unwrap();

        // Apply upstream overlay
        let overlay_yaml = std::fs::read_to_string(fixtures.join("overlay-interceptor-upstream.yaml")).unwrap();
        let overlay = oapi_overlay::from_yaml(&overlay_yaml).unwrap();
        oapi_overlay::apply_overlay(&mut doc, &overlay).unwrap();

        // Apply interceptor overlay
        let overlay_yaml = std::fs::read_to_string(fixtures.join("overlay-interceptor-add-header.yaml")).unwrap();
        let overlay = oapi_overlay::from_yaml(&overlay_yaml).unwrap();
        oapi_overlay::apply_overlay(&mut doc, &overlay).unwrap();

        // Check the interceptor extension landed on the operation as an array
        let get_op = &doc["paths"]["/products"]["get"];
        let interceptor = &get_op["x-plenum-interceptor"];
        assert!(!interceptor.is_null(), "interceptor extension should be present after overlay");
        assert!(interceptor.is_array(), "interceptor extension should be an array");
        assert_eq!(interceptor[0]["hook"], "on_request");
        assert_eq!(interceptor[0]["function"], "onRequest");

        // Now verify oas3 parses it and our code can see the extension
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let products = paths.get("/products").unwrap();
        let get_op = products.methods().into_iter().find(|(m, _)| *m == Method::GET).unwrap().1;
        assert!(get_op.extensions.contains_key("plenum-interceptor"),
            "oas3 should preserve the extension (x- stripped)");
    }
}
```

### Step 2c: Update `lib.rs`

- [ ] **Step 2c-1: Update `lib.rs`**

Make the following changes to `plenum-core/src/lib.rs`:

**Remove the constant at line 27:**
```rust
// DELETE this line:
const INTERCEPTOR_TIMEOUT: Duration = Duration::from_secs(30);
```

**Update `call_interceptor` to accept a `timeout` parameter (around line 57):**
```rust
async fn call_interceptor(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
    timeout: Duration,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call(function_name, input, body, timeout).await?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}
```

**Update `call_interceptor_blocking` to accept a `timeout` parameter (around line 69):**
```rust
fn call_interceptor_blocking(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
    timeout: Duration,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call_blocking(function_name, input, body, timeout)?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}
```

**Update `request_filter` -- Phase 1 of `on_request` (around line 190):**

Replace:
```rust
if let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) {
    if let Some(handle) = op.interceptors.on_request.as_ref() {
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &session.req_header().headers,
        );
        let input_json = serde_json::to_value(&input).unwrap();

        match call_interceptor(handle, "onRequest", input_json, None).await {
            Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
                if let Some(mods) = headers {
                    apply_header_modifications(session.req_header_mut(), &mods);
                }
            }
            Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                session
                    .respond_error_with_body(
                        status,
                        body_out.map(js_body_to_bytes).unwrap_or_default(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
            Err(e) => {
                log::error!("on_request interceptor error: {}", e);
                session
                    .respond_error_with_body(
                        500,
                        GatewayError::internal(format!("interceptor error: {}", e)).body(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
        }
    }
}
```

With:
```rust
if let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) {
    for hook in &op.interceptors.on_request {
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &session.req_header().headers,
        );
        let input_json = serde_json::to_value(&input).unwrap();

        match call_interceptor(&hook.runtime, &hook.function, input_json, None, hook.timeout).await {
            Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
                if let Some(mods) = headers {
                    apply_header_modifications(session.req_header_mut(), &mods);
                }
            }
            Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                session
                    .respond_error_with_body(
                        status,
                        body_out.map(js_body_to_bytes).unwrap_or_default(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
            Err(e) => {
                log::error!("on_request interceptor error: {}", e);
                session
                    .respond_error_with_body(
                        500,
                        GatewayError::internal(format!("interceptor error: {}", e)).body(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
        }
    }
}
```

**Update `request_body_filter` -- early-exit check (around line 248):**

Replace:
```rust
if op.request_body.is_none() && op.interceptors.on_request.is_none() {
    return Ok(());
}
```
With:
```rust
if op.request_body.is_none() && op.interceptors.on_request.is_empty() {
    return Ok(());
}
```

**Update `request_body_filter` -- Phase 2 of `on_request` (around line 295):**

Replace the block starting at `let final_buf = if let Some(handle) = op.interceptors.on_request.as_ref()` through `};` with:

```rust
let final_buf = if !op.interceptors.on_request.is_empty() && !buf.is_empty() {
    let content_type = session
        .req_header()
        .headers
        .get(http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let mut current_buf = buf;
    for hook in &op.interceptors.on_request {
        let js_body = js_body_from_content_type(content_type.as_deref(), &current_buf);
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &session.req_header().headers,
        );
        let input_json = serde_json::to_value(&input).unwrap();
        match call_interceptor(&hook.runtime, &hook.function, input_json, js_body, hook.timeout).await {
            Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
            }
            Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                session
                    .respond_error_with_body(
                        status,
                        body_out.map(js_body_to_bytes).unwrap_or_default(),
                    )
                    .await
                    .ok();
                ctx.request_body_validation_failed = true;
                return Ok(());
            }
            Err(e) => {
                log::error!("on_request interceptor error: {}", e);
                session
                    .respond_error_with_body(
                        500,
                        GatewayError::internal(format!("interceptor error: {}", e)).body(),
                    )
                    .await
                    .ok();
                ctx.request_body_validation_failed = true;
                return Ok(());
            }
        }
    }
    current_buf
} else {
    buf
};
```

**Update `upstream_request_filter` -- `on_request` presence check (around line 370):**

Replace:
```rust
if op.interceptors.on_request.is_some() {
```
With:
```rust
if !op.interceptors.on_request.is_empty() {
```

**Update `upstream_request_filter` -- `on_response_body` presence check (around line 379):**

Replace:
```rust
if op.interceptors.on_response_body.is_some() {
```
With:
```rust
if !op.interceptors.on_response_body.is_empty() {
```

**Update `upstream_request_filter` -- `before_upstream` call (around line 383):**

Replace:
```rust
if let Some(handle) = &op.interceptors.before_upstream {
    let input = request_input_from_parts(
        &upstream_request.method,
        &upstream_request.uri,
        &upstream_request.headers,
    );
    let input_json = serde_json::to_value(&input).unwrap();

    match call_interceptor(handle, "beforeUpstream", input_json, None).await {
        Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
            if let Some(mods) = &headers {
                apply_header_modifications(upstream_request, mods);
            }
        }
        Ok((InterceptorOutput::Respond { .. }, _)) => {
            log::warn!("before_upstream interceptor returned 'respond' -- ignoring (request already committed to upstream)");
        }
        Err(e) => {
            log::error!("before_upstream interceptor error: {}", e);
        }
    }
}
```
With:
```rust
for hook in &op.interceptors.before_upstream {
    let input = request_input_from_parts(
        &upstream_request.method,
        &upstream_request.uri,
        &upstream_request.headers,
    );
    let input_json = serde_json::to_value(&input).unwrap();

    match call_interceptor(&hook.runtime, &hook.function, input_json, None, hook.timeout).await {
        Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
            if let Some(mods) = &headers {
                apply_header_modifications(upstream_request, mods);
            }
        }
        Ok((InterceptorOutput::Respond { .. }, _)) => {
            log::warn!("before_upstream interceptor returned 'respond' -- ignoring (request already committed to upstream)");
        }
        Err(e) => {
            log::error!("before_upstream interceptor error: {}", e);
        }
    }
}
```

**Update `response_filter` -- `on_response` call (around line 422):**

Replace:
```rust
if let Some(handle) = &op.interceptors.on_response {
    let input = response_input_from_parts(
        upstream_response.status,
        &upstream_response.headers,
    );
    let input_json = serde_json::to_value(&input).unwrap();

    match call_interceptor(handle, "onResponse", input_json, None).await {
        Ok((InterceptorOutput::Continue { status, headers }, _)) => {
            if let Some(code) = status {
                if let Ok(status_code) = http::StatusCode::from_u16(code) {
                    upstream_response.set_status(status_code).ok();
                }
            }
            if let Some(mods) = &headers {
                apply_header_modifications(upstream_response, mods);
            }
        }
        Ok((InterceptorOutput::Respond { .. }, _)) => {
            log::warn!("on_response interceptor returned 'respond' -- ignoring (response already in flight)");
        }
        Err(e) => {
            log::error!("on_response interceptor error: {}", e);
        }
    }
}
```
With:
```rust
for hook in &op.interceptors.on_response {
    let input = response_input_from_parts(
        upstream_response.status,
        &upstream_response.headers,
    );
    let input_json = serde_json::to_value(&input).unwrap();

    match call_interceptor(&hook.runtime, &hook.function, input_json, None, hook.timeout).await {
        Ok((InterceptorOutput::Continue { status, headers }, _)) => {
            if let Some(code) = status {
                if let Ok(status_code) = http::StatusCode::from_u16(code) {
                    upstream_response.set_status(status_code).ok();
                }
            }
            if let Some(mods) = &headers {
                apply_header_modifications(upstream_response, mods);
            }
        }
        Ok((InterceptorOutput::Respond { .. }, _)) => {
            log::warn!("on_response interceptor returned 'respond' -- ignoring (response already in flight)");
        }
        Err(e) => {
            log::error!("on_response interceptor error: {}", e);
        }
    }
}
```

**Update `response_filter` -- `on_response_body` presence check (around line 451):**

Replace:
```rust
if op.interceptors.on_response_body.is_some() {
```
With:
```rust
if !op.interceptors.on_response_body.is_empty() {
```

**Update `upstream_response_body_filter` -- early-exit check (around line 478):**

Replace:
```rust
if op.interceptors.on_response_body.is_none() {
    return Ok(None);
}
```
With:
```rust
if op.interceptors.on_response_body.is_empty() {
    return Ok(None);
}
```

**Update `upstream_response_body_filter` -- body processing block (around line 488):**

Replace the block from `if end_of_stream {` through the matching `}` with:

```rust
if end_of_stream {
    let buf = ctx.response_body_buf.split().freeze();
    let status = ctx.upstream_response_status.unwrap_or(http::StatusCode::OK);

    let final_buf = tokio::task::block_in_place(|| {
        let mut current_buf = buf;
        for hook in &op.interceptors.on_response_body {
            let js_body = js_body_from_content_type(
                ctx.upstream_response_content_type.as_deref(),
                &current_buf,
            );
            let input = response_input_from_parts(status, &http::HeaderMap::new());
            let input_json = serde_json::to_value(&input).unwrap();

            match call_interceptor_blocking(
                &hook.runtime,
                &hook.function,
                input_json,
                js_body,
                hook.timeout,
            ) {
                Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                    current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
                }
                Ok((InterceptorOutput::Respond { .. }, _)) => {
                    log::warn!("on_response_body interceptor returned 'respond' -- ignoring");
                }
                Err(e) => {
                    log::error!("on_response_body interceptor error: {}", e);
                }
            }
        }
        current_buf
    });

    *body = Some(final_buf);
}
```

- [ ] **Step 2c-2: Verify the code compiles**

```bash
cargo build -p plenum-core
```

Expected: compiles with no errors. Fix any compilation errors before proceeding.

- [ ] **Step 2c-3: Run all Rust tests**

```bash
cargo test -p plenum-core
```

Expected: all tests pass.

- [ ] **Step 2c-4: Commit**

```bash
git add \
  plenum-core/src/config/interceptor.rs \
  plenum-core/src/path_match/mod.rs \
  plenum-core/src/lib.rs \
  e2e/fixtures/overlay-interceptor-add-header.yaml
git commit -m "feat(gateway): flat array interceptor config with HookHandle and chaining support"
```

---

## Task 3: Update remaining e2e overlay fixtures

All 13 remaining overlays that use `x-plenum-interceptor` need to be converted to the array format. The function name for each is the camelCase equivalent of the hook name: `on_request` -> `onRequest`, `before_upstream` -> `beforeUpstream`, `on_response` -> `onResponse`, `on_response_body` -> `onResponseBody`.

**Files:** 13 YAML files in `e2e/fixtures/`

- [ ] **Step 1: Update `overlay-interceptor-all-hooks.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach all-hooks interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/all-hooks.js"
          hook: on_request
          function: onRequest
        - module: "./interceptors/all-hooks.js"
          hook: before_upstream
          function: beforeUpstream
        - module: "./interceptors/all-hooks.js"
          hook: on_response
          function: onResponse
```

- [ ] **Step 2: Update `overlay-interceptor-block.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach block-request interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/block-request.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 3: Update `overlay-interceptor-block-by-body.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach block-by-body interceptor to POST /products
  version: 1.0.0
actions:
  - target: $.paths[*].post
    update:
      x-plenum-interceptor:
        - module: "./interceptors/block-by-body.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 4: Update `overlay-interceptor-invalid-nonfatal.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach invalid-return interceptor (before_upstream and on_response)
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/invalid-return.js"
          hook: before_upstream
          function: beforeUpstream
        - module: "./interceptors/invalid-return.js"
          hook: on_response
          function: onResponse
```

- [ ] **Step 5: Update `overlay-interceptor-invalid-on-request.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach invalid-return interceptor (on_request only)
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/invalid-return.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 6: Update `overlay-interceptor-modify-request-body.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach modify-request-body interceptor to POST /products
  version: 1.0.0
actions:
  - target: $.paths[*].post
    update:
      x-plenum-interceptor:
        - module: "./interceptors/modify-request-body.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 7: Update `overlay-interceptor-modify-response-body.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach modify-response-body interceptor to GET /products
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/modify-response-body.js"
          hook: on_response_body
          function: onResponseBody
```

- [ ] **Step 8: Update `overlay-interceptor-on-response-modify.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach on-response-modify interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/on-response-modify.js"
          hook: on_response
          function: onResponse
```

- [ ] **Step 9: Update `overlay-interceptor-read-request-body.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach read-request-body interceptor to POST /products
  version: 1.0.0
actions:
  - target: $.paths[*].post
    update:
      x-plenum-interceptor:
        - module: "./interceptors/read-request-body.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 10: Update `overlay-interceptor-respond-ignored.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach respond-ignored interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/respond-ignored.js"
          hook: before_upstream
          function: beforeUpstream
        - module: "./interceptors/respond-ignored.js"
          hook: on_response
          function: onResponse
```

- [ ] **Step 11: Update `overlay-interceptor-sandbox.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach sandbox-escape interceptor
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/sandbox-escape.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 12: Update `overlay-interceptor-throw-nonfatal.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach throw-error interceptor (before_upstream and on_response)
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/throw-error.js"
          hook: before_upstream
          function: beforeUpstream
        - module: "./interceptors/throw-error.js"
          hook: on_response
          function: onResponse
```

- [ ] **Step 13: Update `overlay-interceptor-throw-on-request.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach throw-error interceptor (on_request only)
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/throw-error.js"
          hook: on_request
          function: onRequest
```

- [ ] **Step 14: Run Rust tests to confirm nothing broke**

```bash
cargo test -p plenum-core
```

Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add e2e/fixtures/overlay-interceptor-*.yaml
git commit -m "chore(fixtures): migrate interceptor overlays to flat array config format"
```

---

## Task 4: Add chaining e2e test

**Files:**
- Create: `e2e/fixtures/interceptors/chain-first.js`
- Create: `e2e/fixtures/interceptors/chain-second.js`
- Create: `e2e/fixtures/overlay-interceptor-chain.yaml`
- Create: `e2e/tests/interceptor_chain_test.ts`

- [ ] **Step 1: Create `chain-first.js`**

```js
globalThis.addFirst = function(_request) {
  return { action: "continue", headers: { "x-chain-first": "true" } };
};
```

- [ ] **Step 2: Create `chain-second.js`**

```js
globalThis.addSecond = function(_request) {
  return { action: "continue", headers: { "x-chain-second": "true" } };
};
```

- [ ] **Step 3: Create `overlay-interceptor-chain.yaml`**

```yaml
overlay: 1.1.0
info:
  title: Attach two on_request interceptors (chaining test)
  version: 1.0.0
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/chain-first.js"
          hook: on_request
          function: addFirst
        - module: "./interceptors/chain-second.js"
          hook: on_request
          function: addSecond
```

- [ ] **Step 4: Create `e2e/tests/interceptor_chain_test.ts`**

```typescript
import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "two on_request interceptors both fire in order", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-chain.yaml",
      ],
      extraFiles: [
        { source: "interceptors/chain-first.js", target: "/config/interceptors/chain-first.js" },
        { source: "interceptors/chain-second.js", target: "/config/interceptors/chain-second.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const headers = requests[0].request.headers;
    const headerKeys = Object.keys(headers);

    const firstKey = headerKeys.find(k => k.toLowerCase() === "x-chain-first");
    assert(firstKey !== undefined, `expected x-chain-first header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(headers[firstKey!], "true");

    const secondKey = headerKeys.find(k => k.toLowerCase() === "x-chain-second");
    assert(secondKey !== undefined, `expected x-chain-second header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(headers[secondKey!], "true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add \
  e2e/fixtures/interceptors/chain-first.js \
  e2e/fixtures/interceptors/chain-second.js \
  e2e/fixtures/overlay-interceptor-chain.yaml \
  e2e/tests/interceptor_chain_test.ts
git commit -m "test(e2e): add chaining test for multiple interceptors on same hook phase"
```

---

## Task 5: Verify full test suite

- [ ] **Step 1: Run all Rust tests**

```bash
cargo test
```

Expected: all pass.

- [ ] **Step 2: Run e2e tests**

```bash
cd e2e && deno task test
```

Expected: all pass, including the new `interceptor_chain_test.ts`.

If any e2e test fails, check:
1. The overlay YAML for that test uses the new array format
2. The corresponding JS interceptor file exports the exact function name specified in the overlay
3. The gateway container was rebuilt with the latest Dockerfile (testcontainers rebuilds automatically)
