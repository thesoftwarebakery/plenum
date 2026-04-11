use std::collections::HashSet;
use std::path::{Path, PathBuf};

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

    pub fn check_net(&self, host: &str) -> Result<(), String> {
        if self.allowed_hosts.contains(host) {
            Ok(())
        } else {
            Err(format!(
                "Permission denied: outbound network access to '{host}' is not allowed"
            ))
        }
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
        assert!(perms.check_net("example.com").is_ok());
    }

    #[test]
    fn check_net_denies_unlisted_host() {
        let perms = InterceptorPermissions::default();
        let err = perms.check_net("evil.com").unwrap_err();
        assert!(err.contains("Permission denied"));
        assert!(err.contains("evil.com"));
    }

    #[test]
    fn default_permissions_deny_everything() {
        let perms = InterceptorPermissions::default();
        assert!(perms.check_env("ANY_VAR").is_err());
        assert!(perms.check_net("any.host").is_err());
        assert!(perms.check_read(Path::new("/tmp/file.txt")).is_err());
    }
}
