use serde::Deserialize;

fn default_threads() -> usize {
    1
}
fn default_listen() -> String {
    "0.0.0.0:6188".to_string()
}
fn default_tls_listen() -> String {
    "0.0.0.0:6189".to_string()
}
fn default_timeout_ms() -> u64 {
    30_000
}
fn default_max_body_bytes() -> u64 {
    10_485_760
}

/// TLS termination configuration for the inbound listener.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TlsListenerConfig {
    /// Path to the PEM-encoded certificate file. Relative paths are resolved
    /// against the config directory. Supports `${VAR}` env var substitution.
    #[serde(rename = "cert-path")]
    pub cert_path: String,
    /// Path to the PEM-encoded private key file. Relative paths are resolved
    /// against the config directory. Supports `${VAR}` env var substitution.
    #[serde(rename = "key-path")]
    pub key_path: String,
    /// Address and port for the TLS listener. Defaults to `"0.0.0.0:6189"`.
    #[serde(default = "default_tls_listen")]
    pub listen: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServerConfig {
    #[serde(default = "default_threads")]
    pub threads: usize,
    #[serde(default)]
    pub daemon: bool,
    #[serde(default = "default_listen")]
    pub listen: String,
    #[serde(
        default = "default_timeout_ms",
        rename = "interceptor-default-timeout-ms"
    )]
    pub interceptor_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms", rename = "plugin-default-timeout-ms")]
    pub plugin_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms", rename = "request-timeout-ms")]
    pub request_timeout_ms: u64,
    #[serde(default = "default_max_body_bytes", rename = "max-request-body-bytes")]
    pub max_request_body_bytes: u64,
    /// Inbound TLS listener configuration. When present, the gateway also
    /// listens for HTTPS connections in addition to the plain TCP listener.
    #[serde(default)]
    pub tls: Option<TlsListenerConfig>,
    /// Path to a PEM CA bundle used to verify outbound HTTPS upstream
    /// connections. When absent, the system trust store is used. All upstreams
    /// share this CA store — per-route CA scoping is not yet supported.
    /// Relative paths are resolved against the config directory.
    /// Supports `${VAR}` env var substitution.
    #[serde(default, rename = "ca-file")]
    pub ca_file: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            threads: default_threads(),
            daemon: false,
            listen: default_listen(),
            interceptor_default_timeout_ms: default_timeout_ms(),
            plugin_default_timeout_ms: default_timeout_ms(),
            request_timeout_ms: default_timeout_ms(),
            max_request_body_bytes: default_max_body_bytes(),
            tls: None,
            ca_file: None,
        }
    }
}

impl ServerConfig {
    /// Expand env vars, resolve relative paths against `config_base`, and
    /// validate that all configured cert/key/CA files exist on disk.
    ///
    /// Call this once after deserialization, before using any path fields.
    pub fn resolve_paths(&mut self, config_base: &str) -> Result<(), String> {
        if let Some(tls) = self.tls.as_mut() {
            tls.cert_path = resolve_path_field(&tls.cert_path, config_base, "tls.cert_path")?;
            tls.key_path = resolve_path_field(&tls.key_path, config_base, "tls.key_path")?;
        }
        if let Some(ca_file) = self.ca_file.as_mut() {
            *ca_file = resolve_path_field(ca_file, config_base, "ca-file")?;
        }
        Ok(())
    }
}

/// Expand env vars in `s`, resolve it relative to `config_base` if not absolute,
/// then verify the resulting path exists. Returns the final absolute path.
fn resolve_path_field(s: &str, config_base: &str, field: &str) -> Result<String, String> {
    // Env var expansion: reuse the same logic as upstream config paths.
    let expanded = super::resolve_env_vars(serde_json::Value::String(s.to_string()))
        .map_err(|e| format!("{field}: {e}"))?;
    let expanded = expanded.as_str().unwrap_or_default();

    // Resolve relative paths against the config directory.
    let path = if std::path::Path::new(expanded).is_absolute() {
        expanded.to_string()
    } else {
        std::path::Path::new(config_base)
            .join(expanded)
            .to_string_lossy()
            .into_owned()
    };

    // Fail loudly before pingora gets a chance to panic on a missing file.
    if !std::path::Path::new(&path).exists() {
        return Err(format!("{field} not found: {path}"));
    }

    Ok(path)
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
            "interceptor-default-timeout-ms": 5000
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.interceptor_default_timeout_ms, 5000);
    }

    #[test]
    fn interceptor_default_timeout_ms_defaults_to_30_000() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.interceptor_default_timeout_ms, 30_000);
    }

    #[test]
    fn deserializes_plugin_default_timeout_ms() {
        let json = serde_json::json!({
            "plugin-default-timeout-ms": 3000
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.plugin_default_timeout_ms, 3000);
    }

    #[test]
    fn plugin_default_timeout_ms_defaults_to_30_000() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.plugin_default_timeout_ms, 30_000);
    }

    #[test]
    fn deserializes_request_timeout_ms() {
        let json = serde_json::json!({
            "request-timeout-ms": 10000
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.request_timeout_ms, 10000);
    }

    #[test]
    fn request_timeout_ms_defaults_to_30_000() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.request_timeout_ms, 30_000);
    }

    #[test]
    fn deserializes_max_request_body_bytes() {
        let json = serde_json::json!({
            "max-request-body-bytes": 1048576
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.max_request_body_bytes, 1048576);
    }

    #[test]
    fn max_request_body_bytes_defaults_to_10mb() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.max_request_body_bytes, 10_485_760);
    }

    #[test]
    fn rejects_unknown_field() {
        let json = serde_json::json!({ "threads": 1, "unknown_key": true });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field unknown_key"
        );
    }

    #[test]
    fn tls_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.tls.is_none());
    }

    #[test]
    fn ca_file_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.ca_file.is_none());
    }

    #[test]
    fn deserializes_tls_config() {
        let json = serde_json::json!({
            "tls": {
                "cert-path": "/etc/ssl/cert.pem",
                "key-path": "/etc/ssl/key.pem"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tls = config.tls.unwrap();
        assert_eq!(tls.cert_path, "/etc/ssl/cert.pem");
        assert_eq!(tls.key_path, "/etc/ssl/key.pem");
        assert_eq!(tls.listen, "0.0.0.0:6189");
    }

    #[test]
    fn deserializes_tls_config_with_custom_listen() {
        let json = serde_json::json!({
            "tls": {
                "cert-path": "/etc/ssl/cert.pem",
                "key-path": "/etc/ssl/key.pem",
                "listen": "0.0.0.0:8443"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tls = config.tls.unwrap();
        assert_eq!(tls.listen, "0.0.0.0:8443");
    }

    #[test]
    fn rejects_unknown_field_in_tls_config() {
        let json = serde_json::json!({
            "tls": {
                "cert-path": "/etc/ssl/cert.pem",
                "key-path": "/etc/ssl/key.pem",
                "unknown": true
            }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for unknown field in tls");
    }

    #[test]
    fn rejects_tls_config_missing_cert_path() {
        let json = serde_json::json!({
            "tls": { "key-path": "/etc/ssl/key.pem" }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for missing cert_path");
    }

    #[test]
    fn rejects_tls_config_missing_key_path() {
        let json = serde_json::json!({
            "tls": { "cert-path": "/etc/ssl/cert.pem" }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for missing key_path");
    }

    #[test]
    fn deserializes_ca_file() {
        let json = serde_json::json!({ "ca-file": "/etc/ssl/ca.pem" });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.ca_file.unwrap(), "/etc/ssl/ca.pem");
    }

    #[test]
    fn default_trait_includes_tls_none_and_ca_file_none() {
        let config = ServerConfig::default();
        assert!(config.tls.is_none());
        assert!(config.ca_file.is_none());
    }
}
