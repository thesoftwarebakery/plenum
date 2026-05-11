use std::collections::HashMap;
use std::error::Error;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use plenum_js_runtime::PluginRuntime;

use super::{PluginHandle, StaticResponse, Upstream};
use crate::config::UpstreamConfig;
use crate::load_balancing;
use crate::path_match::module_resolver;
use crate::upstream_peer::make_peer;

/// Cache key for plugin runtimes. Incorporates both the module identity and
/// the normalized (sorted, order-independent) permissions so that the same
/// module file used with different permission sets gets separate runtimes.
#[derive(Debug, Hash, Eq, PartialEq)]
pub(crate) struct PluginRuntimeKey {
    module: module_resolver::ModuleCacheKey,
    env: Vec<String>,  // sorted
    read: Vec<String>, // sorted canonical paths
    net: Vec<String>,  // sorted
}

impl PluginRuntimeKey {
    pub(crate) fn new(
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

/// Build an `Upstream` from a parsed `UpstreamConfig`.
///
/// Handles all upstream variants: HTTP single peer, HTTP pool (with optional health checks),
/// plugin (spawns Node.js runtime), and static responses. Plugin runtimes are cached by
/// `plugin_runtime_cache` so the same runtime is reused across paths/operations.
pub(crate) fn build_upstream(
    upstream_config: &UpstreamConfig,
    path: &str,
    config_base: &Path,
    default_plugin_timeout: Duration,
    plugin_runtime_cache: &mut HashMap<PluginRuntimeKey, Arc<dyn PluginRuntime>>,
    background_services: &mut Vec<load_balancing::builder::BackgroundHealthService>,
) -> Result<Upstream, Box<dyn Error>> {
    match upstream_config {
        UpstreamConfig::HTTP {
            address,
            port,
            tls,
            tls_verify,
            ..
        } => Ok(Upstream::Http(Box::new(make_peer(
            address,
            *port,
            *tls,
            *tls_verify,
        )))),
        UpstreamConfig::HTTPPool {
            backends,
            tls,
            tls_verify,
            selection,
            hash_key,
            health_check,
            ..
        } => {
            let result = load_balancing::build_pool(
                backends,
                *selection,
                *tls,
                *tls_verify,
                hash_key.as_ref(),
                health_check.as_ref(),
            )
            .map_err(|e| format!("path '{}': {}", path, e))?;
            if let Some(bg) = result.background_service {
                background_services.push(bg);
            }
            Ok(Upstream::HttpPool(Arc::new(result.pool)))
        }
        UpstreamConfig::Plugin {
            plugin,
            options,
            permissions,
            timeout: upstream_config_timeout,
            streaming,
        } => {
            let resolved = module_resolver::resolve_module(plugin, config_base)
                .map_err(|e| format!("path '{}': plugin '{}': {}", path, plugin, e))?;
            let cache_key = PluginRuntimeKey::new(resolved.cache_key(), permissions);

            let plugin_timeout = upstream_config_timeout
                .map(|t| *t)
                .unwrap_or(default_plugin_timeout);

            let h = match plugin_runtime_cache.entry(cache_key) {
                std::collections::hash_map::Entry::Occupied(e) => e.get().clone(),
                std::collections::hash_map::Entry::Vacant(e) => {
                    let init_options = match options.as_ref() {
                        Some(o) => o.clone(),
                        None => serde_json::json!({}),
                    };

                    let plugin_module_path = match &resolved {
                        module_resolver::ResolvedModule::File(p) => {
                            p.to_string_lossy().into_owned()
                        }
                        module_resolver::ResolvedModule::Internal { path: p, .. } => {
                            p.to_string_lossy().into_owned()
                        }
                    };

                    let h: Arc<dyn PluginRuntime> = Arc::new(
                        plenum_js_runtime::external::spawn_sync(
                            &plugin_module_path,
                            init_options.clone(),
                            Default::default(),
                        )
                        .map_err(|e| {
                            format!(
                                "path '{}': plugin '{}': failed to spawn Node.js runtime: {}",
                                path, plugin, e
                            )
                        })?,
                    );

                    // Call init() now that the process is up.
                    h.call_blocking("init", init_options, None, plugin_timeout)
                        .map_err(|e| {
                            format!("path '{}': plugin '{}': init() failed: {}", path, plugin, e)
                        })?;

                    e.insert(h).clone()
                }
            };

            Ok(Upstream::Plugin(PluginHandle {
                runtime: h,
                timeout: plugin_timeout,
                streaming: *streaming,
            }))
        }
        UpstreamConfig::Static {
            status,
            headers,
            body,
        } => {
            let body_bytes = match body {
                Some(s) => s.as_bytes().to_vec(),
                None => Vec::new(),
            };
            Ok(Upstream::Static(StaticResponse {
                status: *status,
                headers: headers
                    .as_ref()
                    .map(|h| h.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                    .unwrap_or_default(),
                body: Bytes::from(body_bytes),
            }))
        }
    }
}
