use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use deno_permissions::{
    Permissions, PermissionsContainer, PermissionsOptions, RuntimePermissionDescriptorParser,
};
use sys_traits::impls::RealSys;

/// Permissions granted to a single interceptor module.
/// Constructed from the `permissions` block in the interceptor overlay config.
/// All fields default to empty, which means deny-all.
#[derive(Debug, Clone, Default)]
pub struct InterceptorPermissions {
    /// Environment variable names the interceptor may read.
    pub allowed_env_vars: HashSet<String>,
    /// Filesystem paths (or path prefixes) the interceptor may read.
    pub allowed_read_paths: Vec<PathBuf>,
    /// Hostnames (without port) the interceptor may make outbound requests to.
    pub allowed_hosts: HashSet<String>,
}

impl InterceptorPermissions {
    pub fn check_env(&self, key: &str) -> Result<(), String> {
        if self.allowed_env_vars.contains(key) {
            Ok(())
        } else {
            Err(format!(
                "Permission denied: env var '{key}' is not allowed for this interceptor"
            ))
        }
    }

    pub fn check_read(&self, path: &Path) -> Result<(), String> {
        // Canonicalize the requested path to resolve symlinks and `..` components.
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let allowed = self
            .allowed_read_paths
            .iter()
            .any(|allowed| canonical.starts_with(allowed));
        if allowed {
            Ok(())
        } else {
            Err(format!(
                "Permission denied: read access to '{}' is not allowed",
                canonical.display()
            ))
        }
    }

    /// Check whether outbound network access to `host` (and optionally `port`) is permitted.
    ///
    /// The check succeeds if `allowed_hosts` contains either the bare hostname or the
    /// "hostname:port" string, so operators can grant broad access ("db.internal") or
    /// port-specific access ("db.internal:5432").
    pub fn check_net(&self, host: &str, port: Option<u16>) -> Result<(), String> {
        let host_port = port.map(|p| format!("{host}:{p}"));
        if self.allowed_hosts.contains(host)
            || host_port
                .as_ref()
                .is_some_and(|hp| self.allowed_hosts.contains(hp.as_str()))
        {
            Ok(())
        } else {
            let addr = host_port.as_deref().unwrap_or(host);
            Err(format!(
                "Permission denied: outbound network access to '{addr}' is not allowed"
            ))
        }
    }

    /// Convert to a `deno_permissions::PermissionsContainer` for use by `deno_fetch` and
    /// `deno_web` extensions. The mapping is:
    ///
    /// - `allowed_hosts` -> `allow_net` (hostname strings, e.g. "example.com" or "example.com:443")
    /// - All other categories -> `None` (deny all)
    /// - `prompt = false` (never prompt -- deny-all by default)
    ///
    /// Our own `InterceptorPermissions` remains in `OpState` for `op_read_env` / `op_read_file`.
    pub fn to_deno_permissions_container(&self) -> PermissionsContainer {
        let parser = Arc::new(RuntimePermissionDescriptorParser::new(RealSys));
        let allow_net = if self.allowed_hosts.is_empty() {
            None // None = deny all
        } else {
            Some(self.allowed_hosts.iter().cloned().collect())
        };
        let perms = Permissions::from_options(
            &*parser,
            &PermissionsOptions {
                allow_net,
                prompt: false,
                ..Default::default()
            },
        )
        .expect("valid permission options");
        PermissionsContainer::new(parser, perms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_env_allows_listed_var() {
        let mut perms = InterceptorPermissions::default();
        perms.allowed_env_vars.insert("MY_VAR".to_string());
        assert!(perms.check_env("MY_VAR").is_ok());
    }

    #[test]
    fn check_env_denies_unlisted_var() {
        let perms = InterceptorPermissions::default();
        let err = perms.check_env("SECRET").unwrap_err();
        assert!(err.contains("Permission denied"));
        assert!(err.contains("SECRET"));
    }

    #[test]
    fn check_net_allows_listed_host() {
        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("example.com".to_string());
        assert!(perms.check_net("example.com", None).is_ok());
    }

    #[test]
    fn check_net_allows_bare_host_for_any_port() {
        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("db.internal".to_string());
        assert!(perms.check_net("db.internal", Some(5432)).is_ok());
    }

    #[test]
    fn check_net_allows_host_port_match() {
        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("db.internal:5432".to_string());
        assert!(perms.check_net("db.internal", Some(5432)).is_ok());
        // Other ports on the same host are denied
        assert!(perms.check_net("db.internal", Some(5433)).is_err());
    }

    #[test]
    fn check_net_denies_unlisted_host() {
        let perms = InterceptorPermissions::default();
        let err = perms.check_net("evil.com", None).unwrap_err();
        assert!(err.contains("Permission denied"));
        assert!(err.contains("evil.com"));
    }

    #[test]
    fn default_permissions_deny_everything() {
        let perms = InterceptorPermissions::default();
        assert!(perms.check_env("ANY_VAR").is_err());
        assert!(perms.check_net("any.host", None).is_err());
        assert!(perms.check_read(Path::new("/tmp/file.txt")).is_err());
    }
}
