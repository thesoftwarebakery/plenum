mod types;
pub mod external;

pub use types::{CallOutput, JsBody, JsError};

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

/// Permissions granted to a single interceptor or plugin module.
///
/// On Linux, these are enforced via bubblewrap (see `opengateway-sandbox`).
/// On other platforms, they inform environment variable filtering only.
/// All fields default to empty, which means no restrictions are applied
/// (used for plugins and built-in interceptors that don't require sandboxing).
#[derive(Debug, Clone, Default)]
pub struct InterceptorPermissions {
    /// Environment variable names the module may read.
    pub allowed_env_vars: HashSet<String>,
    /// Filesystem paths (or path prefixes) the module may read.
    pub allowed_read_paths: Vec<PathBuf>,
    /// Hostnames (without port) the module may make outbound requests to.
    pub allowed_hosts: HashSet<String>,
}

/// Trait abstracting a plugin/interceptor runtime that can execute named JS functions.
///
/// Implemented by [`external::ExternalRuntime`] (out-of-process Node.js over Unix sockets).
#[async_trait::async_trait]
pub trait PluginRuntime: Send + Sync {
    /// Call an exported function with a JSON argument and optional body.
    async fn call(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError>;

    /// Synchronous variant for use from non-async contexts (e.g. pingora body filters).
    fn call_blocking(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError>;
}
