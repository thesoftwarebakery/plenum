//! Runtime spawning and validation helpers for JS interceptor hooks.
//!
//! Extracts the repeated "resolve module → check cache → spawn → validate" pattern
//! used when building both per-operation interceptors and the global `on_gateway_error` hook.

use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use std::time::Duration;

use plenum_js_runtime::PluginRuntime;

use crate::config::ServerConfig;
use crate::path_match::{HookHandle, module_resolver};

/// Spawn a Node.js interceptor runtime for the given resolved module with the given permissions.
///
/// `context` is a human-readable prefix used in error messages
/// (e.g. `"path '/foo': interceptor 'bar.js'"`).
pub(crate) fn spawn_interceptor_runtime(
    resolved: &module_resolver::ResolvedModule,
    permissions: plenum_js_runtime::InterceptorPermissions,
    context: &str,
) -> Result<Arc<dyn PluginRuntime>, Box<dyn Error>> {
    let module_path = match resolved {
        module_resolver::ResolvedModule::File(p) => p.to_string_lossy().into_owned(),
        module_resolver::ResolvedModule::Internal { path: p, .. } => {
            p.to_string_lossy().into_owned()
        }
    };
    let h: Arc<dyn PluginRuntime> = Arc::new(
        plenum_js_runtime::external::spawn_sync(&module_path, serde_json::json!({}), permissions)
            .map_err(|e| -> Box<dyn Error> {
            format!("{context}: failed to spawn Node.js runtime: {e}").into()
        })?,
    );
    Ok(h)
}

/// Call `validate()` on a runtime if it exports the function.
///
/// `FunctionNotFound` is silently ignored — it just means the module doesn't validate.
/// Any other error is returned with `context` prepended to the message.
pub(crate) fn validate_hook(
    runtime: &dyn PluginRuntime,
    validate_arg: serde_json::Value,
    timeout: Duration,
    context: &str,
) -> Result<(), Box<dyn Error>> {
    match runtime.call_blocking("validate", validate_arg, None, timeout) {
        Ok(_) => Ok(()),
        Err(plenum_js_runtime::JsError::FunctionNotFound(_)) => Ok(()),
        Err(e) => Err(format!("{context}: validate() failed: {e}").into()),
    }
}

/// Resolve the global `on_gateway_error` interceptor hook from `ServerConfig`.
///
/// The runtime is deduplicated via `runtime_cache` — if the same module is already
/// used by a per-operation interceptor, the same process is reused.
pub(crate) fn resolve_global_error_hook(
    server_config: &ServerConfig,
    config_base: &std::path::Path,
    runtime_cache: &mut HashMap<module_resolver::ModuleCacheKey, Arc<dyn PluginRuntime>>,
    default_timeout: Duration,
) -> Result<Option<HookHandle>, Box<dyn Error>> {
    let cfg = match &server_config.on_gateway_error {
        Some(c) => c,
        None => return Ok(None),
    };

    let resolved = module_resolver::resolve_module(&cfg.module, config_base)
        .map_err(|e| format!("on_gateway_error interceptor '{}': {}", cfg.module, e))?;
    let cache_key = resolved.cache_key();
    let context = format!("on_gateway_error interceptor '{}'", cfg.module);

    let runtime = match runtime_cache.entry(cache_key) {
        std::collections::hash_map::Entry::Occupied(e) => e.get().clone(),
        std::collections::hash_map::Entry::Vacant(e) => {
            let permissions = cfg
                .permissions
                .clone()
                .map(|p| p.into_runtime_permissions())
                .unwrap_or_default();
            let h = spawn_interceptor_runtime(&resolved, permissions, &context)?;
            e.insert(h).clone()
        }
    };

    let timeout = cfg.timeout.map(|t| *t).unwrap_or(default_timeout);

    let validate_arg = serde_json::json!({
        "module": &cfg.module,
        "hook": "on_gateway_error",
        "function": &cfg.function,
    });
    validate_hook(runtime.as_ref(), validate_arg, timeout, &context)?;

    Ok(Some(HookHandle {
        runtime,
        function: cfg.function.clone(),
        timeout,
        options: cfg.options.clone(),
    }))
}
