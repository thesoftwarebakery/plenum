use serde::Deserialize;

fn default_threads() -> usize {
    1
}
fn default_listen() -> String {
    "0.0.0.0:6188".to_string()
}
fn default_timeout_ms() -> u64 {
    30_000
}
fn default_max_body_bytes() -> u64 {
    10_485_760
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
    #[serde(default = "default_timeout_ms")]
    pub interceptor_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms")]
    pub plugin_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms")]
    pub request_timeout_ms: u64,
    #[serde(default = "default_max_body_bytes")]
    pub max_request_body_bytes: u64,
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
            "plugin_default_timeout_ms": 3000
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
            "request_timeout_ms": 10000
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
            "max_request_body_bytes": 1048576
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
}
