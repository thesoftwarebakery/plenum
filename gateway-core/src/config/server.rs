use serde::Deserialize;

fn default_threads() -> usize { 1 }

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_threads")]
    pub threads: usize,
    #[serde(default)]
    pub daemon: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            threads: default_threads(),
            daemon: false,
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
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.threads, 4);
        assert!(config.daemon);
    }

    #[test]
    fn uses_defaults_when_fields_missing() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.threads, 1);
        assert!(!config.daemon);
    }

    #[test]
    fn default_trait_matches_serde_defaults() {
        let config = ServerConfig::default();
        assert_eq!(config.threads, 1);
        assert!(!config.daemon);
    }
}
