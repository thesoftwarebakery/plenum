mod module_resolver;

use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use http::Method;
use matchit::Router;
use oas3::spec::{Operation, PathItem};
use opengateway_js_runtime::JsRuntimeHandle;
use pingora_core::upstreams::peer::HttpPeer;

use crate::config::{
    Config, InterceptorConfig, ServerConfig, UpstreamConfig, ValidationOverride, resolve_env_vars,
};
use crate::openapi::operation::{
    build_operation_meta, compile_request_body_schema, compile_response_schemas,
};
use crate::upstream_http::make_peer;
use crate::validation::schema::CompiledSchema;

/// Handle to a spawned Deno backend plugin runtime.
pub struct PluginHandle {
    pub runtime: Arc<JsRuntimeHandle>,
    pub timeout: Duration,
}

impl std::fmt::Debug for PluginHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginHandle")
            .field("timeout", &self.timeout)
            .finish_non_exhaustive()
    }
}

/// The upstream target for a route -- either an HTTP peer or a Deno backend plugin.
#[derive(Debug)]
pub enum Upstream {
    Http(Box<HttpPeer>),
    Plugin(PluginHandle),
}

/// A resolved interceptor hook: runtime handle, JS function name, call timeout, and options.
pub struct HookHandle {
    pub runtime: Arc<JsRuntimeHandle>,
    pub function: String,
    pub timeout: Duration,
    pub options: Option<serde_json::Value>,
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
    /// Raw `x-opengateway-backend` extension value from the operation, passed opaquely to the
    /// plugin's `handle()` function. Never interpreted by the gateway itself.
    pub backend_config: Option<serde_json::Value>,
    /// Curated OpenAPI Operation Object JSON value built at boot time. Contains operationId,
    /// summary, parameters, requestBody, responses, and a bundled components.schemas for any
    /// referenced component schemas. x-opengateway-* extensions are stripped.
    pub operation_meta: serde_json::Value,
}

/// A route entry stored in the router, containing the upstream target
/// and per-operation schema information for validation.
pub struct RouteEntry {
    pub upstream: Upstream,
    /// True only for HTTP upstreams with `buffer-response: true`. Plugin upstreams are always
    /// buffered implicitly (they return a complete response object). This flag gates boot-time
    /// validation for `on_response_body` interceptors on HTTP routes.
    pub buffer_response: bool,
    pub operations: HashMap<Method, OperationSchemas>,
    pub validation_override: Option<ValidationOverride>,
}

pub type OpenGatewayRouter = Router<Arc<RouteEntry>>;

/// Cache key for plugin runtimes. Incorporates both the module identity and
/// the normalized (sorted, order-independent) permissions so that the same
/// module file used with different permission sets gets separate runtimes.
#[derive(Debug, Hash, Eq, PartialEq)]
struct PluginRuntimeKey {
    module: module_resolver::ModuleCacheKey,
    env: Vec<String>,  // sorted
    read: Vec<String>, // sorted canonical paths
    net: Vec<String>,  // sorted
}

impl PluginRuntimeKey {
    fn new(
        module: module_resolver::ModuleCacheKey,
        permissions: &Option<crate::config::PermissionsConfig>,
    ) -> Self {
        let (mut env, mut read, mut net) = match permissions {
            None => (vec![], vec![], vec![]),
            Some(p) => {
                let read_paths: Vec<String> = p
                    .read
                    .iter()
                    .map(|s| {
                        let path = std::path::PathBuf::from(s);
                        path.canonicalize()
                            .unwrap_or(path)
                            .to_string_lossy()
                            .into_owned()
                    })
                    .collect();
                (p.env.clone(), read_paths, p.net.clone())
            }
        };
        env.sort();
        read.sort();
        net.sort();
        Self {
            module,
            env,
            read,
            net,
        }
    }
}

/// Parse an operation's `x-opengateway-interceptor` extension and build interceptor handles.
fn build_operation_interceptors(
    operation: &Operation,
    config_base: &Path,
    runtime_cache: &mut HashMap<module_resolver::ModuleCacheKey, Arc<JsRuntimeHandle>>,
    default_timeout: Duration,
) -> Result<OperationInterceptors, Box<dyn Error>> {
    let interceptor_value = match operation.extensions.get("opengateway-interceptor") {
        Some(v) => v,
        None => return Ok(OperationInterceptors::default()),
    };

    let interceptor_configs: Vec<InterceptorConfig> =
        serde_json::from_value(interceptor_value.clone())?;

    let mut interceptors = OperationInterceptors::default();
    for config in &interceptor_configs {
        let resolved = module_resolver::resolve_module(&config.module, config_base)?;
        let cache_key = resolved.cache_key();

        // Deduplicate: reuse handle if this module was already spawned.
        let runtime = match runtime_cache.entry(cache_key) {
            std::collections::hash_map::Entry::Occupied(e) => {
                // The runtime for this module was already spawned with the first config's
                // permissions. Permissions are per-runtime, not per-call, so any permissions
                // declared on subsequent configs for the same module are silently ignored.
                // Warn so operators know their permissions config has no effect.
                if config.permissions.is_some() {
                    log::warn!(
                        "interceptor module '{}' is referenced multiple times; permissions \
                         declared here are ignored -- only the first reference's permissions \
                         take effect",
                        config.module
                    );
                }
                e.get().clone()
            }
            std::collections::hash_map::Entry::Vacant(e) => {
                let permissions = config
                    .permissions
                    .clone()
                    .map(|p| p.into_runtime_permissions())
                    .unwrap_or_default();

                let h = Arc::new(match &resolved {
                    module_resolver::ResolvedModule::File(path) => {
                        opengateway_js_runtime::spawn_runtime_sync(path, permissions)?
                    }
                    module_resolver::ResolvedModule::Internal { name, source } => {
                        opengateway_js_runtime::spawn_runtime_from_source_sync(
                            name,
                            source,
                            permissions,
                        )?
                    }
                });
                e.insert(h).clone()
            }
        };

        let timeout = config
            .timeout_ms
            .map(Duration::from_millis)
            .unwrap_or(default_timeout);

        let hook_handle = HookHandle {
            runtime,
            function: config.function.clone(),
            timeout,
            options: config.options.clone(),
        };

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
) -> Result<OpenGatewayRouter, Box<dyn Error>> {
    let server_config: ServerConfig = config
        .extension(&config.spec.extensions, "opengateway-config")
        .unwrap_or_else(|_| ServerConfig::default());
    let default_interceptor_timeout =
        Duration::from_millis(server_config.interceptor_default_timeout_ms);
    let default_plugin_timeout = Duration::from_millis(server_config.plugin_default_timeout_ms);

    let mut router = Router::new();
    let mut interceptor_runtime_cache: HashMap<
        module_resolver::ModuleCacheKey,
        Arc<JsRuntimeHandle>,
    > = HashMap::new();
    let mut plugin_runtime_cache: HashMap<PluginRuntimeKey, Arc<JsRuntimeHandle>> = HashMap::new();

    for (path, path_item) in paths {
        let upstream_config: UpstreamConfig =
            config.extension(&path_item.extensions, "opengateway-upstream")?;

        let upstream_buffer_response = matches!(
            &upstream_config,
            UpstreamConfig::HTTP {
                buffer_response: true,
                ..
            }
        );
        let upstream = match &upstream_config {
            UpstreamConfig::HTTP { address, port, .. } => {
                Upstream::Http(Box::new(make_peer(address, *port)))
            }
            UpstreamConfig::Plugin {
                plugin,
                options,
                permissions,
                timeout_ms: upstream_config_timeout_ms,
            } => {
                let resolved = module_resolver::resolve_module(plugin, config_base)?;
                let cache_key = PluginRuntimeKey::new(resolved.cache_key(), permissions);

                let plugin_timeout = upstream_config_timeout_ms
                    .map(Duration::from_millis)
                    .unwrap_or(default_plugin_timeout);

                let h = match plugin_runtime_cache.entry(cache_key) {
                    std::collections::hash_map::Entry::Occupied(e) => e.get().clone(),
                    std::collections::hash_map::Entry::Vacant(e) => {
                        let perms = permissions
                            .clone()
                            .map(|p| p.into_runtime_permissions())
                            .unwrap_or_default();

                        let h = Arc::new(match &resolved {
                            module_resolver::ResolvedModule::File(path) => {
                                opengateway_js_runtime::spawn_runtime_sync(path, perms)?
                            }
                            module_resolver::ResolvedModule::Internal { name, source } => {
                                opengateway_js_runtime::spawn_runtime_from_source_sync(
                                    name, source, perms,
                                )?
                            }
                        });

                        // Call init() with resolved options (empty object when not specified)
                        let init_options = options
                            .as_ref()
                            .map(|o| resolve_env_vars(o.clone()))
                            .unwrap_or_else(|| serde_json::json!({}));
                        h.call_blocking("init", init_options, None, plugin_timeout)?;

                        e.insert(h).clone()
                    }
                };

                Upstream::Plugin(PluginHandle {
                    runtime: h,
                    timeout: plugin_timeout,
                })
            }
        };

        // Path-level validation override
        let path_validation: Option<ValidationOverride> = config
            .extension(&path_item.extensions, "opengateway-validation")
            .ok();

        // Build operation schemas for each method on this path
        let mut operations = HashMap::new();
        for (method, operation) in path_item.methods() {
            let request_body = compile_request_body_schema(operation, &config.spec);
            let (responses, default_response) = compile_response_schemas(operation, &config.spec);

            // Operation-level validation override
            let op_validation: Option<ValidationOverride> = operation
                .extensions
                .get("opengateway-validation")
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            // Operation-level interceptors
            let interceptors = build_operation_interceptors(
                operation,
                config_base,
                &mut interceptor_runtime_cache,
                default_interceptor_timeout,
            )?;

            // Operation-level backend config (opaque, passed to plugin's handle())
            let backend_config: Option<serde_json::Value> =
                operation.extensions.get("opengateway-backend").cloned();

            // Curated operation metadata for runtime use by plugins/interceptors
            let operation_meta = build_operation_meta(operation, &config.spec);

            operations.insert(
                method,
                OperationSchemas {
                    request_body,
                    responses,
                    default_response,
                    validation_override: op_validation,
                    interceptors,
                    backend_config,
                    operation_meta,
                },
            );
        }

        // HTTP upstreams: on_response_body interceptors require buffer-response: true.
        // Plugin upstreams: response is always fully buffered (no restriction needed).
        if matches!(upstream, Upstream::Http(_)) && !upstream_buffer_response {
            for (method, op_schemas) in &operations {
                if !op_schemas.interceptors.on_response_body.is_empty() {
                    return Err(format!(
                        "path '{}' method {} has on_response_body interceptors but upstream \
                         does not set buffer-response: true",
                        path, method
                    )
                    .into());
                }
            }
        }

        let entry = Arc::new(RouteEntry {
            upstream,
            buffer_response: upstream_buffer_response,
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
    use std::path::PathBuf;

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
                    "x-opengateway-upstream": {
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
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-opengateway-upstream": {
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
                        "x-opengateway-interceptor": [
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
                    "x-opengateway-upstream": {
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
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "invalid_hook",
                            "function": "someFunction"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        let err = result.err().unwrap().to_string();
        assert!(
            err.contains("unknown interceptor hook"),
            "expected error mentioning unknown hook, got: {}",
            err
        );
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
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest",
                            "timeout_ms": 5000
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_millis(5000)
        );
    }

    #[test]
    fn propogates_options_to_hook_handle() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest",
                            "options": {
                                "role": "admin",
                                "allowed_methods": ["GET", "POST"]
                            }
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        let options = get.interceptors.on_request[0].options.as_ref().unwrap();
        assert_eq!(options["role"].as_str().unwrap(), "admin");
        assert_eq!(options["allowed_methods"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn hook_handle_options_is_none_when_not_configured() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        assert!(get.interceptors.on_request[0].options.is_none());
    }

    #[test]
    fn falls_back_to_global_server_config_timeout() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-opengateway-config": { "interceptor_default_timeout_ms": 15000 },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_millis(15000)
        );
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
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_millis(30_000)
        );
    }

    #[test]
    fn resolves_internal_module_interceptor() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": "internal:add-header",
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-opengateway-upstream": {
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
        assert_eq!(get.interceptors.on_request.len(), 1);
        assert_eq!(get.interceptors.on_request[0].function, "onRequest");
        assert!(get.interceptors.before_upstream.is_empty());
        assert!(get.interceptors.on_response.is_empty());
    }

    #[test]
    fn plugin_upstream_creates_upstream_plugin_variant() {
        let plugin_path = fixture_path("echo_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        assert!(matches!(matched.value.upstream, Upstream::Plugin(_)));
    }

    #[test]
    fn http_upstream_still_creates_upstream_http_variant() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        assert!(matches!(matched.value.upstream, Upstream::Http(_)));
    }

    #[test]
    fn backend_config_parsed_from_operation_extension() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-backend": { "table": "users", "query": "find_by_id" },
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        let backend = get.backend_config.as_ref().unwrap();
        assert_eq!(backend["table"].as_str().unwrap(), "users");
        assert_eq!(backend["query"].as_str().unwrap(), "find_by_id");
    }

    #[test]
    fn backend_config_is_none_when_extension_absent() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base()).unwrap();
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert!(get.backend_config.is_none());
    }

    #[test]
    fn overlay_applies_interceptor_extension() {
        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("e2e")
            .join("fixtures");

        let yaml = std::fs::read_to_string(fixtures.join("openapi-interceptor.yaml")).unwrap();
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml).unwrap();

        // Apply upstream overlay
        let overlay_yaml =
            std::fs::read_to_string(fixtures.join("overlay-interceptor-upstream.yaml")).unwrap();
        let overlay = oapi_overlay::from_yaml(&overlay_yaml).unwrap();
        oapi_overlay::apply_overlay(&mut doc, &overlay).unwrap();

        // Apply interceptor overlay
        let overlay_yaml =
            std::fs::read_to_string(fixtures.join("overlay-interceptor-add-header.yaml")).unwrap();
        let overlay = oapi_overlay::from_yaml(&overlay_yaml).unwrap();
        oapi_overlay::apply_overlay(&mut doc, &overlay).unwrap();

        // Check the interceptor extension landed on the operation as an array
        let get_op = &doc["paths"]["/products"]["get"];
        let interceptor = &get_op["x-opengateway-interceptor"];
        assert!(
            !interceptor.is_null(),
            "interceptor extension should be present after overlay"
        );
        assert!(
            interceptor.is_array(),
            "interceptor extension should be an array"
        );
        assert_eq!(interceptor[0]["hook"], "on_request");
        assert_eq!(interceptor[0]["function"], "onRequest");

        // Now verify oas3 parses it and our code can see the extension
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let products = paths.get("/products").unwrap();
        let get_op = products
            .methods()
            .into_iter()
            .find(|(m, _)| *m == Method::GET)
            .unwrap()
            .1;
        assert!(
            get_op.extensions.contains_key("opengateway-interceptor"),
            "oas3 should preserve the extension (x- stripped)"
        );
    }

    #[test]
    fn buffer_response_defaults_to_false() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        assert!(!matched.value.buffer_response);
    }

    #[test]
    fn rejects_on_response_body_without_buffer_response() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
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
        let err = result.err().unwrap().to_string();
        assert!(
            err.contains("buffer-response"),
            "expected error mentioning buffer-response, got: {}",
            err
        );
    }

    #[test]
    fn accepts_on_response_body_with_buffer_response() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080,
                        "buffer-response": true
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, Path::new("/"));
        assert!(result.is_ok());
    }

    #[test]
    fn plugin_upstream_skips_buffer_response_validation() {
        // Plugin upstreams always return a full response -- on_response_body interceptors
        // work without buffer-response: true.
        let noop_path = fixture_path("noop.js");
        let plugin_path = fixture_path("echo_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-opengateway-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, Path::new("/"));
        assert!(
            result.is_ok(),
            "plugin upstream should not require buffer-response"
        );
    }

    #[test]
    fn plugin_upstream_uses_per_plugin_timeout_ms() {
        let plugin_path = fixture_path("echo_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-opengateway-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path,
                        "timeout_ms": 12345
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at("/test").unwrap();
        if let Upstream::Plugin(handle) = &matched.value.upstream {
            assert_eq!(handle.timeout, Duration::from_millis(12345));
        } else {
            panic!("expected Plugin upstream");
        }
    }

    // --- build_operation_meta tests ---

    fn get_operation_meta(
        doc: serde_json::Value,
        path: &str,
        method: http::Method,
    ) -> serde_json::Value {
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap();
        let matched = router.at(path).unwrap();
        let op = matched.value.operations.get(&method).unwrap();
        op.operation_meta.clone()
    }

    #[test]
    fn operation_meta_basic_fields() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "summary": "List all items",
                        "parameters": [{
                            "name": "limit",
                            "in": "query",
                            "schema": { "type": "integer" }
                        }],
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": { "type": "object" }
                                }
                            }
                        },
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        assert_eq!(meta["operationId"].as_str().unwrap(), "listItems");
        assert_eq!(meta["summary"].as_str().unwrap(), "List all items");
        assert!(meta["parameters"].is_array());
        assert_eq!(meta["parameters"].as_array().unwrap().len(), 1);
        assert_eq!(meta["parameters"][0]["name"].as_str().unwrap(), "limit");
        assert!(meta["requestBody"].is_object());
        assert!(meta["responses"].is_object());
        assert!(meta["responses"]["200"].is_object());
    }

    #[test]
    fn operation_meta_ref_bundling() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" }
                        }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        // The response schema $ref should be preserved
        let schema = &meta["responses"]["200"]["content"]["application/json"]["schema"];
        assert_eq!(schema["$ref"].as_str().unwrap(), "#/components/schemas/Foo");
        // The referenced schema should be bundled
        assert!(
            meta["components"]["schemas"]["Foo"].is_object(),
            "Foo should be bundled under components.schemas"
        );
    }

    #[test]
    fn operation_meta_transitive_ref_bundling() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": {
                            "bar": { "$ref": "#/components/schemas/Bar" }
                        }
                    },
                    "Bar": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string" }
                        }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        assert!(
            meta["components"]["schemas"]["Foo"].is_object(),
            "Foo should be bundled"
        );
        assert!(
            meta["components"]["schemas"]["Bar"].is_object(),
            "Bar should be transitively bundled"
        );
    }

    #[test]
    fn operation_meta_circular_ref_does_not_hang() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": {
                            "self": { "$ref": "#/components/schemas/Foo" }
                        }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        // Must not loop infinitely; Foo should appear exactly once
        assert!(
            meta["components"]["schemas"]["Foo"].is_object(),
            "Foo should be bundled once"
        );
    }

    #[test]
    fn operation_meta_empty_operation_omits_optional_fields() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        assert!(
            meta.get("operationId").is_none(),
            "operationId should be absent when not set"
        );
        assert!(
            meta.get("summary").is_none(),
            "summary should be absent when not set"
        );
        assert!(
            meta.get("parameters").is_none(),
            "parameters should be absent when empty"
        );
        assert!(
            meta.get("requestBody").is_none(),
            "requestBody should be absent when not set"
        );
        // responses with only description and no schema content still appear
        assert!(meta["responses"].is_object());
    }

    #[test]
    fn operation_meta_strips_opengateway_extensions() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "x-opengateway-interceptor": [{
                            "module": "internal:add-header",
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": {
                            "200": { "description": "ok" }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::GET);
        assert_no_opengateway_keys(&meta, "meta");
        assert_eq!(meta["operationId"].as_str().unwrap(), "listItems");
    }

    fn assert_no_opengateway_keys(val: &serde_json::Value, path: &str) {
        if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                assert!(
                    !k.starts_with("x-opengateway-"),
                    "x-opengateway- key '{}' found at {}",
                    k,
                    path
                );
                assert_no_opengateway_keys(v, &format!("{}.{}", path, k));
            }
        } else if let Some(arr) = val.as_array() {
            for (i, v) in arr.iter().enumerate() {
                assert_no_opengateway_keys(v, &format!("{}[{}]", path, i));
            }
        }
    }

    #[test]
    fn operation_meta_strips_opengateway_extensions_nested() {
        // Extensions nested inside requestBody and responses should also be stripped.
        let doc = serde_json::json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0.0.1" },
            "paths": {
                "/items": {
                    "post": {
                        "operationId": "createItem",
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": { "type": "object" },
                                    "x-opengateway-custom": "should-be-stripped"
                                }
                            }
                        },
                        "responses": {
                            "200": {
                                "description": "ok",
                                "x-opengateway-custom": "should-be-stripped"
                            }
                        }
                    },
                    "x-opengateway-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080
                    }
                }
            }
        });

        let meta = get_operation_meta(doc, "/items", http::Method::POST);
        assert_no_opengateway_keys(&meta, "meta");
    }

    #[test]
    fn plugin_runtime_key_differentiates_by_permissions() {
        use crate::config::PermissionsConfig;
        let module = module_resolver::ModuleCacheKey::Internal("test".into());

        let key_none = PluginRuntimeKey::new(module.clone(), &None);
        let key_with_env = PluginRuntimeKey::new(
            module.clone(),
            &Some(PermissionsConfig {
                env: vec!["FOO".into()],
                read: vec![],
                net: vec![],
            }),
        );
        let key_env_reordered = PluginRuntimeKey::new(
            module.clone(),
            &Some(PermissionsConfig {
                env: vec!["BAR".into(), "FOO".into()],
                read: vec![],
                net: vec![],
            }),
        );
        let key_env_same_order_independent = PluginRuntimeKey::new(
            module.clone(),
            &Some(PermissionsConfig {
                env: vec!["BAR".into(), "FOO".into()],
                read: vec![],
                net: vec![],
            }),
        );

        assert_ne!(key_none, key_with_env);
        assert_ne!(key_with_env, key_env_reordered);
        assert_eq!(key_env_reordered, key_env_same_order_independent);
    }
}
