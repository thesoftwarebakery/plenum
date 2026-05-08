pub(crate) mod module_resolver;

use oas_query::ParameterDef;
use plenum_config::{ConfigDuration, ConfigValue};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::error::Error;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use http::Method;
use matchit::Router;
use oas3::spec::{Operation, PathItem};
use plenum_js_runtime::PluginRuntime;

use crate::config::{
    Config, CorsConfig, InterceptorConfig, RateLimitConfig, ServerConfig, UpstreamConfig,
    validate_rate_limit_configs,
};
use crate::cors;
use crate::load_balancing;
use crate::openapi::operation::build_operation_meta;
use crate::upstream::build_upstream;

// Re-export upstream types for backward compatibility.
pub use crate::upstream::{PluginHandle, StaticResponse, Upstream};

/// A resolved interceptor hook: runtime handle, JS function name, call timeout, and options.
pub struct HookHandle {
    pub runtime: Arc<dyn PluginRuntime>,
    pub function: String,
    pub timeout: Duration,
    pub options: Option<serde_json::Value>,
}

/// JS interceptor handles for a single operation, one per lifecycle hook.
/// Each vec preserves the array order from the config, which is the execution order.
#[derive(Default)]
pub struct OperationInterceptors {
    pub on_request_headers: Vec<HookHandle>,
    pub on_request: Vec<HookHandle>,
    pub before_upstream: Vec<HookHandle>,
    pub on_response: Vec<HookHandle>,
    pub on_response_body: Vec<HookHandle>,
}

/// Per-operation metadata resolved at boot time.
pub struct OperationSchemas {
    pub interceptors: OperationInterceptors,
    /// Pre-compiled `x-plenum-backend` extension value from the operation. Tokens are
    /// compiled at boot time and resolved per-request before being passed to the plugin's
    /// `handle()` function.
    pub backend_config: Option<ConfigValue>,
    /// Curated OpenAPI Operation Object JSON value built at boot time. Contains operationId,
    /// summary, parameters, requestBody, responses, and a bundled components.schemas for any
    /// referenced component schemas. x-plenum-* extensions are stripped.
    pub operation_meta: serde_json::Value,
    /// Overall request timeout resolved from operation > path > global default.
    pub request_timeout: Duration,
    /// Maximum inbound request body size in bytes, resolved from operation > path > global default.
    pub max_request_body_bytes: u64,
    /// CORS configuration for this operation, if `x-plenum-cors` is present.
    pub cors: Option<CorsConfig>,
    /// Rate limit configurations for this operation. Empty when no `x-plenum-rate-limit` is present.
    pub rate_limit: Vec<RateLimitConfig>,
    /// Per-operation upstream override. When `Some`, takes priority over `RouteEntry.upstream`.
    pub upstream: Option<Upstream>,
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
    /// The OpenAPI path template for this route (e.g. `/users/{id}`).
    /// Populated in `ctx.gateway.route` for each interceptor/plugin call.
    pub path: String,
    /// Pre-compiled path parameter schemas used to coerce raw matchit captures to typed
    /// JSON values at request time. Built once at startup from the operation parameter
    /// definitions; path params are path-level and shared across all methods on a route.
    pub path_param_schemas: Vec<oas_query::ParameterDef>,
}

impl RouteEntry {
    /// Look up the operation for the given method.
    /// For HEAD requests, falls back to GET when no explicit HEAD is defined (RFC 9110).
    pub fn get_operation(&self, method: &Method) -> Option<&OperationSchemas> {
        self.operations.get(method).or_else(|| {
            if *method == Method::HEAD {
                self.operations.get(&Method::GET)
            } else {
                None
            }
        })
    }

    /// Resolve the effective upstream for a given operation.
    /// Per-operation upstream takes priority over path-level upstream.
    pub fn effective_upstream<'a>(&'a self, op: &'a OperationSchemas) -> &'a Upstream {
        op.upstream.as_ref().unwrap_or(&self.upstream)
    }

    /// Return the sorted list of HTTP methods this route accepts, including
    /// implicit HEAD when GET is defined (RFC 9110).
    pub fn allowed_methods(&self) -> Vec<&str> {
        let mut methods: Vec<&str> = self.operations.keys().map(|m| m.as_str()).collect();
        if self.operations.contains_key(&Method::GET)
            && !self.operations.contains_key(&Method::HEAD)
        {
            methods.push("HEAD");
        }
        methods.sort();
        methods
    }
}

pub type PlenumRouter = Router<Arc<RouteEntry>>;

/// Result of building the gateway router, including any background services
/// that must be registered with the pingora server (e.g. health check loops).
pub struct RouterBuildResult {
    pub router: PlenumRouter,
    pub background_services: Vec<load_balancing::builder::BackgroundHealthService>,
    /// Global `on_gateway_error` interceptor hook, resolved at boot time.
    pub error_hook: Option<HookHandle>,
    /// Distinct rate limit window durations (in seconds) collected from all operations at
    /// boot time. Used by `build_gateway` to construct one `Rate` instance per window.
    pub rate_limit_windows: HashSet<u64>,
}

use crate::upstream::PluginRuntimeKey;

/// Parse an operation's `x-plenum-interceptor` extension and build interceptor handles.
fn build_operation_interceptors(
    operation: &Operation,
    path: &str,
    config: &Config,
    config_base: &Path,
    runtime_cache: &mut HashMap<module_resolver::ModuleCacheKey, Arc<dyn PluginRuntime>>,
    default_timeout: Duration,
) -> Result<OperationInterceptors, Box<dyn Error>> {
    let interceptor_value = match operation.extensions.get("plenum-interceptor") {
        Some(v) => v,
        None => return Ok(OperationInterceptors::default()),
    };

    let interceptor_configs: Vec<InterceptorConfig> = config
        .resolve(interceptor_value)
        .map_err(|e| format!("path '{}': x-plenum-interceptor: {}", path, e))?;

    let mut interceptors = OperationInterceptors::default();
    for config in &interceptor_configs {
        let resolved = module_resolver::resolve_module(&config.module, config_base)
            .map_err(|e| format!("path '{}': interceptor '{}': {}", path, config.module, e))?;
        let cache_key = resolved.cache_key();
        let context = format!("path '{}': interceptor '{}'", path, config.module);

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
                let h = crate::runtime_builder::spawn_interceptor_runtime(
                    &resolved,
                    permissions,
                    &context,
                )?;
                e.insert(h).clone()
            }
        };

        let timeout = config.timeout.map(|t| *t).unwrap_or(default_timeout);

        let validate_arg = serde_json::to_value(config).unwrap();
        crate::runtime_builder::validate_hook(runtime.as_ref(), validate_arg, timeout, &context)?;

        let hook_handle = HookHandle {
            runtime,
            function: config.function.clone(),
            timeout,
            options: config.options.clone(),
        };

        match config.hook.as_str() {
            "on_request_headers" => interceptors.on_request_headers.push(hook_handle),
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
) -> Result<RouterBuildResult, Box<dyn Error>> {
    let server_config: ServerConfig = config
        .extension(&config.spec.extensions, "plenum-config")
        .unwrap_or_else(|_| ServerConfig::default());
    let default_interceptor_timeout = *server_config.interceptor_default_timeout;
    let default_plugin_timeout = *server_config.plugin_default_timeout;
    let default_request_timeout = *server_config.request_timeout;
    let default_max_body_bytes = server_config.max_request_body_bytes;

    let mut router = Router::new();
    let mut background_services = Vec::new();
    let mut rate_limit_windows: HashSet<u64> = HashSet::new();
    let mut interceptor_runtime_cache: HashMap<
        module_resolver::ModuleCacheKey,
        Arc<dyn PluginRuntime>,
    > = HashMap::new();
    let mut plugin_runtime_cache: HashMap<PluginRuntimeKey, Arc<dyn PluginRuntime>> =
        HashMap::new();

    for (path, path_item) in paths {
        let upstream_config: Option<UpstreamConfig> = config
            .extension_cascade(&[&path_item.extensions], "plenum-upstream")
            .map_err(|e| format!("path '{}': x-plenum-upstream: {}", path, e))?;

        let upstream_buffer_response = matches!(
            &upstream_config,
            Some(UpstreamConfig::HTTP {
                buffer_response: true,
                ..
            }) | Some(UpstreamConfig::HTTPPool {
                buffer_response: true,
                ..
            })
        );

        let upstream = match upstream_config {
            Some(uc) => {
                uc.emit_security_warnings(path);
                build_upstream(
                    &uc,
                    path,
                    config_base,
                    default_plugin_timeout,
                    &mut plugin_runtime_cache,
                    &mut background_services,
                )?
            }
            None => {
                log::warn!(
                    "path '{}': no x-plenum-upstream configured — requests will receive 501 Not Implemented",
                    path
                );
                Upstream::NotConfigured
            }
        };

        // Build operation metadata for each method on this path
        let mut operations = HashMap::new();
        for (method, operation) in path_item.methods() {
            // Request timeout (op > path > global)
            let request_timeout = config
                .extension_cascade::<ConfigDuration>(
                    &[&operation.extensions, &path_item.extensions],
                    "plenum-timeout",
                )
                .map_err(|e| format!("path '{}' method {}: x-plenum-timeout: {}", path, method, e))?
                .map(|d| *d)
                .unwrap_or(default_request_timeout);

            // Body size limit (op > path > global)
            let max_request_body_bytes = config
                .extension_cascade::<u64>(
                    &[&operation.extensions, &path_item.extensions],
                    "plenum-body-limit",
                )
                .map_err(|e| {
                    format!(
                        "path '{}' method {}: x-plenum-body-limit: {}",
                        path, method, e
                    )
                })?
                .unwrap_or(default_max_body_bytes);

            // Operation-level interceptors
            let interceptors = build_operation_interceptors(
                operation,
                path,
                config,
                config_base,
                &mut interceptor_runtime_cache,
                default_interceptor_timeout,
            )?;

            // Operation-level backend config — compiled at boot time for cheap per-request resolution
            let backend_config: Option<ConfigValue> = operation
                .extensions
                .get("plenum-backend")
                .map(ConfigValue::from_json);

            // Operation-level CORS config
            let cors: Option<CorsConfig> = operation
                .extensions
                .get("plenum-cors")
                .map(|v| config.resolve::<CorsConfig>(v))
                .transpose()
                .map_err(|e| format!("path '{}' method {}: x-plenum-cors: {}", path, method, e))?;

            // Validate CORS config at boot time
            if let Some(ref cors_config) = cors {
                cors::validate_cors_config(cors_config)
                    .map_err(|e| format!("path '{}' method {}: {}", path, method, e))?;
            }

            // Rate limit configs (op > path, absent = empty vec)
            let rate_limit: Vec<RateLimitConfig> = config
                .extension_cascade::<Vec<RateLimitConfig>>(
                    &[&operation.extensions, &path_item.extensions],
                    "plenum-rate-limit",
                )
                .map_err(|e| {
                    format!(
                        "path '{}' method {}: x-plenum-rate-limit: {}",
                        path, method, e
                    )
                })?
                .unwrap_or_default();
            if !rate_limit.is_empty() {
                validate_rate_limit_configs(&rate_limit, path)
                    .map_err(|e| -> Box<dyn Error> { e.into() })?;
                for rl in &rate_limit {
                    rate_limit_windows.insert(rl.window.as_secs());
                }
            }

            // Per-operation upstream override (operation-level only; path-level is on RouteEntry)
            let op_upstream_config: Option<UpstreamConfig> = config
                .extension_cascade(&[&operation.extensions], "plenum-upstream")
                .map_err(|e| {
                    format!(
                        "path '{}' method {}: x-plenum-upstream: {}",
                        path, method, e
                    )
                })?;
            let op_upstream = match op_upstream_config {
                Some(uc) => {
                    uc.emit_security_warnings(&format!("{} {}", method, path));
                    Some(build_upstream(
                        &uc,
                        path,
                        config_base,
                        default_plugin_timeout,
                        &mut plugin_runtime_cache,
                        &mut background_services,
                    )?)
                }
                None => None,
            };

            // Curated operation metadata for runtime use by plugins/interceptors
            let operation_meta = build_operation_meta(operation, &config.spec);

            operations.insert(
                method,
                OperationSchemas {
                    interceptors,
                    backend_config,
                    operation_meta,
                    request_timeout,
                    max_request_body_bytes,
                    cors,
                    rate_limit,
                    upstream: op_upstream,
                },
            );
        }

        // For each operation, check the effective upstream (op-level > path-level).
        // - Plugin upstreams: call validate() with the operation's backend_config.
        // - HTTP upstreams without buffer-response: reject on_response_body interceptors.
        for (method, op_schemas) in &operations {
            let effective = op_schemas.upstream.as_ref().unwrap_or(&upstream);

            if let Upstream::Plugin(plugin_handle) = effective {
                let validate_arg = match &op_schemas.backend_config {
                    Some(config) => {
                        use crate::request_context::{ExtractionCtx, PingoraRequest};
                        let empty_req = pingora_http::RequestHeader::build("GET", b"/", None)
                            .expect("valid request");
                        let empty_params: std::collections::HashMap<String, serde_json::Value> =
                            std::collections::HashMap::new();
                        let empty_cx = ExtractionCtx {
                            req: PingoraRequest(&empty_req),
                            path_params: &empty_params,
                            user_ctx: None,
                            peer_addr: None,
                            query_params: None,
                            body_json: None,
                        };
                        config.resolve(&empty_cx)
                    }
                    None => serde_json::Value::Null,
                };
                match plugin_handle.runtime.call_blocking(
                    "validate",
                    validate_arg,
                    None,
                    plugin_handle.timeout,
                ) {
                    Ok(_) => {}
                    Err(plenum_js_runtime::JsError::FunctionNotFound(_)) => {}
                    Err(e) => {
                        return Err(format!(
                            "path '{}' method {}: plugin validate() failed: {}",
                            path, method, e
                        )
                        .into());
                    }
                }
            }

            // HTTP upstreams: on_response_body interceptors require buffer-response: true.
            // Plugin upstreams: response is always fully buffered (no restriction needed).
            if matches!(effective, Upstream::Http(_) | Upstream::HttpPool(_))
                && !upstream_buffer_response
                && !op_schemas.interceptors.on_response_body.is_empty()
            {
                return Err(format!(
                    "path '{}' method {} has on_response_body interceptors but upstream \
                     does not set buffer-response: true",
                    path, method
                )
                .into());
            }
        }

        // Collect path parameter schemas — shared across all methods on a path.
        // First definition of each name wins (path params must be consistent per-path).
        let mut path_param_schemas: Vec<ParameterDef> = Vec::new();
        let mut seen_path_params: HashSet<String> = HashSet::new();
        for op_schemas in operations.values() {
            if let Some(arr) = op_schemas
                .operation_meta
                .get("parameters")
                .and_then(|v| v.as_array())
            {
                for param_json in arr {
                    if let Some(def) = ParameterDef::path_from_json(param_json)
                        && seen_path_params.insert(def.name.clone())
                    {
                        path_param_schemas.push(def);
                    }
                }
            }
        }

        let entry = Arc::new(RouteEntry {
            upstream,
            buffer_response: upstream_buffer_response,
            operations,
            path: path.to_string(),
            path_param_schemas,
        });
        router
            .insert(path, entry)
            .map_err(|e| format!("path '{}': {}", path, e))?;
    }
    // Resolve the global on_gateway_error interceptor if configured.
    let error_hook = crate::runtime_builder::resolve_global_error_hook(
        &server_config,
        config_base,
        &mut interceptor_runtime_cache,
        default_interceptor_timeout,
    )?;

    Ok(RouterBuildResult {
        router,
        background_services,
        error_hook,
        rate_limit_windows,
    })
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
    fn builds_router_for_spec_with_schemas() {
        // Verifies that build_router succeeds on specs containing request body and response
        // schemas (schemas are no longer stored on OperationSchemas -- validation is done
        // by the user-configured internal:validate-request / internal:validate-response
        // interceptors).
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        assert!(matched.value.operations.contains_key(&Method::POST));
        assert!(matched.value.operations.contains_key(&Method::GET));
    }

    #[test]
    fn operations_without_interceptor_have_empty_vecs() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert!(get.interceptors.on_request_headers.is_empty());
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request.len(), 1);
        assert_eq!(get.interceptors.on_request[0].function, "onRequest");
        assert!(get.interceptors.on_request_headers.is_empty());
        assert!(get.interceptors.before_upstream.is_empty());
        assert!(get.interceptors.on_response.is_empty());
    }

    #[test]
    fn parses_on_request_headers_hook() {
        let noop_path = fixture_path("noop.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request_headers",
                            "function": "onRequestHeaders"
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.interceptors.on_request_headers.len(), 1);
        assert_eq!(
            get.interceptors.on_request_headers[0].function,
            "onRequestHeaders"
        );
        assert!(get.interceptors.on_request.is_empty());
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
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
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_request",
                            "function": "onRequest",
                            "timeout": "5s"
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_secs(5)
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
                        "x-plenum-interceptor": [{
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
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
            "x-plenum-config": { "interceptor-default-timeout": "15s" },
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_secs(15)
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(
            get.interceptors.on_request[0].timeout,
            Duration::from_secs(30)
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
                        "x-plenum-interceptor": [{
                            "module": "internal:add-header",
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
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
                    "x-plenum-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        assert!(matches!(matched.value.upstream, Upstream::Plugin(_)));
    }

    #[test]
    fn http_upstream_still_creates_upstream_http_variant() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
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
                        "x-plenum-backend": { "table": "users", "query": "find_by_id" },
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        let backend_cv = get.backend_config.as_ref().unwrap();
        // Resolve with an empty context to get a serde_json::Value for assertions.
        use crate::request_context::{ExtractionCtx, PingoraRequest};
        let empty_req = pingora_http::RequestHeader::build("GET", b"/", None).unwrap();
        let empty_params = std::collections::HashMap::new();
        let empty_cx = ExtractionCtx {
            req: PingoraRequest(&empty_req),
            path_params: &empty_params,
            user_ctx: None,
            peer_addr: None,
            query_params: None,
            body_json: None,
        };
        let backend = backend_cv.resolve(&empty_cx);
        assert_eq!(backend["table"].as_str().unwrap(), "users");
        assert_eq!(backend["query"].as_str().unwrap(), "find_by_id");
    }

    #[test]
    fn backend_config_is_none_when_extension_absent() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
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
        let interceptor = &get_op["x-plenum-interceptor"];
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
            get_op.extensions.contains_key("plenum-interceptor"),
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
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
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
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
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
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
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
                        "x-plenum-interceptor": [{
                            "module": &noop_path,
                            "hook": "on_response_body",
                            "function": "onResponseBody"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
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
    fn plugin_upstream_uses_per_plugin_timeout() {
        let plugin_path = fixture_path("echo_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path,
                        "timeout": "12345ms"
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, Path::new("/")).unwrap().router;
        let matched = router.at("/test").unwrap();
        if let Upstream::Plugin(handle) = &matched.value.upstream {
            assert_eq!(handle.timeout, Duration::from_millis(12345));
        } else {
            panic!("expected Plugin upstream");
        }
    }

    #[test]
    fn plugin_validate_fails_with_bad_backend_config() {
        let plugin_path = fixture_path("validate_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-backend": {},
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
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
            err.contains("validate() failed"),
            "expected error mentioning validate() failed, got: {}",
            err
        );
    }

    #[test]
    fn plugin_validate_passes_with_good_backend_config() {
        let plugin_path = fixture_path("validate_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-backend": { "table": "users" },
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, Path::new("/"));
        assert!(result.is_ok(), "expected Ok but got: {:?}", result.err());
    }

    #[test]
    fn plugin_validate_called_with_null_when_no_backend_config() {
        // validate_plugin.js throws when config is null/falsy.
        // This operation has no x-plenum-backend, so validate() should be called with null
        // and build_router should return Err containing "validate() failed".
        let plugin_path = fixture_path("validate_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
                        "kind": "plugin",
                        "plugin": &plugin_path
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
            err.contains("validate() failed"),
            "expected error mentioning validate() failed, got: {}",
            err
        );
    }

    #[test]
    fn plugin_without_validate_export_succeeds() {
        // echo_plugin.js has no validate() export -- FunctionNotFound is silently ignored.
        let plugin_path = fixture_path("echo_plugin.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-backend": { "table": "users" },
                        "responses": { "200": { "description": "ok" } }
                    },
                    "x-plenum-upstream": {
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
            "plugin without validate() should start fine, got: {:?}",
            result.err()
        );
    }

    #[test]
    fn interceptor_validate_fails_with_bad_config() {
        let interceptor_path = fixture_path("validate_interceptor.js");
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": {
                        "x-plenum-interceptor": [{
                            "module": &interceptor_path,
                            "hook": "on_request",
                            "function": "onRequest",
                            "options": {}
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
        let err = result.err().unwrap().to_string();
        assert!(
            err.contains("validate() failed"),
            "expected error mentioning validate() failed, got: {}",
            err
        );
    }

    #[test]
    fn interceptor_without_validate_export_succeeds() {
        // noop.js has no validate() export -- FunctionNotFound is silently ignored.
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
        let result = build_router(&config, paths, Path::new("/"));
        assert!(
            result.is_ok(),
            "interceptor without validate() should start fine, got: {:?}",
            result.err()
        );
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

    #[test]
    fn request_timeout_defaults_to_global() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.request_timeout, Duration::from_secs(30));
    }

    #[test]
    fn request_timeout_from_global_config() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-plenum-config": { "request-timeout": "5s" },
            "paths": {
                "/test": {
                    "get": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.request_timeout, Duration::from_secs(5));
    }

    #[test]
    fn request_timeout_path_overrides_global() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-plenum-config": { "request-timeout": "5s" },
            "paths": {
                "/test": {
                    "x-plenum-timeout": "2s",
                    "get": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.request_timeout, Duration::from_secs(2));
    }

    #[test]
    fn request_timeout_operation_overrides_path() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "x-plenum-timeout": "5s",
                    "get": {
                        "x-plenum-timeout": "1s",
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.request_timeout, Duration::from_secs(1));
    }

    #[test]
    fn body_limit_defaults_to_global() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.max_request_body_bytes, 10_485_760);
    }

    #[test]
    fn body_limit_from_global_config() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-plenum-config": { "max-request-body-bytes": 1024 },
            "paths": {
                "/test": {
                    "get": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.max_request_body_bytes, 1024);
    }

    #[test]
    fn body_limit_path_overrides_global() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "x-plenum-config": { "max-request-body-bytes": 1024 },
            "paths": {
                "/test": {
                    "x-plenum-body-limit": 512,
                    "get": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.max_request_body_bytes, 512);
    }

    #[test]
    fn body_limit_operation_overrides_path() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "x-plenum-body-limit": 512,
                    "get": {
                        "x-plenum-body-limit": 256,
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/test").unwrap();
        let get = matched.value.operations.get(&Method::GET).unwrap();
        assert_eq!(get.max_request_body_bytes, 256);
    }

    #[test]
    fn rejects_tls_verify_without_tls() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": { "responses": { "200": { "description": "ok" } } },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 8080,
                        "tls-verify": false
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
            err.contains("tls-verify"),
            "expected error mentioning tls-verify, got: {}",
            err
        );
    }

    #[test]
    fn accepts_tls_upstream() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/test": {
                    "get": { "responses": { "200": { "description": "ok" } } },
                    "x-plenum-upstream": {
                        "kind": "HTTP",
                        "address": "127.0.0.1",
                        "port": 443,
                        "tls": true
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, Path::new("/"));
        assert!(
            result.is_ok(),
            "expected Ok for TLS upstream, got: {:?}",
            result.err()
        );
    }

    #[test]
    fn head_falls_back_to_get() {
        let config = config_with_schema();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        // HEAD is not explicitly defined, but GET is — fallback should work.
        assert!(matched.value.get_operation(&Method::HEAD).is_some());
        // The returned operation should be the same as GET's.
        let get_op = matched.value.get_operation(&Method::GET).unwrap() as *const _;
        let head_op = matched.value.get_operation(&Method::HEAD).unwrap() as *const _;
        assert_eq!(get_op, head_op);
    }

    #[test]
    fn head_without_get_returns_none() {
        // Build a spec with only POST on /items — HEAD should not fall back.
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "post": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        assert!(matched.value.get_operation(&Method::HEAD).is_none());
    }

    #[test]
    fn explicit_head_takes_precedence() {
        // Build a spec with both GET and HEAD explicitly defined.
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    },
                    "head": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        // Both should exist as separate entries.
        assert!(matched.value.operations.contains_key(&Method::HEAD));
        assert!(matched.value.operations.contains_key(&Method::GET));
        // get_operation(HEAD) should return HEAD's own entry, not GET's.
        let head_direct = matched.value.operations.get(&Method::HEAD).unwrap() as *const _;
        let head_via_helper = matched.value.get_operation(&Method::HEAD).unwrap() as *const _;
        assert_eq!(head_direct, head_via_helper);
    }

    #[test]
    fn path_without_upstream_uses_not_configured() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/no-upstream": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let result = build_router(&config, paths, &dummy_config_base());
        assert!(
            result.is_ok(),
            "build_router should succeed without upstream"
        );
        let router = result.unwrap().router;
        let matched = router.at("/no-upstream").unwrap();
        assert!(matches!(matched.value.upstream, Upstream::NotConfigured));
    }

    #[test]
    fn per_operation_upstream_overrides_path_upstream() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/items": {
                    "get": {
                        "x-plenum-upstream": {
                            "kind": "HTTP",
                            "address": "127.0.0.1",
                            "port": 9090
                        },
                        "responses": { "200": { "description": "ok" } }
                    },
                    "post": {
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
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/items").unwrap();
        let route = &matched.value;

        // GET has a per-operation override (port 9090)
        let get = route.operations.get(&Method::GET).unwrap();
        assert!(get.upstream.is_some(), "GET should have per-op upstream");
        let effective_get = route.effective_upstream(get);
        match effective_get {
            Upstream::Http(peer) => {
                let addr = format!("{:?}", peer._address);
                assert!(
                    addr.contains("9090"),
                    "GET should route to port 9090, got: {}",
                    addr
                );
            }
            other => panic!("expected Http upstream for GET, got: {:?}", other),
        }

        // POST has no override — falls back to path-level (port 8080)
        let post = route.operations.get(&Method::POST).unwrap();
        assert!(
            post.upstream.is_none(),
            "POST should not have per-op upstream"
        );
        let effective_post = route.effective_upstream(post);
        match effective_post {
            Upstream::Http(peer) => {
                let addr = format!("{:?}", peer._address);
                assert!(
                    addr.contains("8080"),
                    "POST should route to port 8080, got: {}",
                    addr
                );
            }
            other => panic!("expected Http upstream for POST, got: {:?}", other),
        }
    }

    #[test]
    fn per_operation_upstream_on_path_without_upstream() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {
                "/mixed": {
                    "get": {
                        "x-plenum-upstream": {
                            "kind": "HTTP",
                            "address": "127.0.0.1",
                            "port": 8080
                        },
                        "responses": { "200": { "description": "ok" } }
                    },
                    "post": {
                        "responses": { "200": { "description": "ok" } }
                    }
                }
            }
        });
        let config = Config::from_value(doc).unwrap();
        let paths = config.spec.paths.as_ref().unwrap();
        let router = build_router(&config, paths, &dummy_config_base())
            .unwrap()
            .router;
        let matched = router.at("/mixed").unwrap();
        let route = &matched.value;

        // GET has an upstream override
        let get = route.operations.get(&Method::GET).unwrap();
        let effective_get = route.effective_upstream(get);
        assert!(matches!(effective_get, Upstream::Http(_)));

        // POST falls through to path-level NotConfigured
        let post = route.operations.get(&Method::POST).unwrap();
        let effective_post = route.effective_upstream(post);
        assert!(matches!(effective_post, Upstream::NotConfigured));
    }
}
