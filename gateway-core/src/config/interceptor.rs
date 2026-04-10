use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,
    pub hook: String,
    pub function: String,
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub options: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_flat_interceptor_config() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "timeout_ms": 2000
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.module, "./interceptors/auth.js");
        assert_eq!(config.hook, "on_request");
        assert_eq!(config.function, "checkAuth");
        assert_eq!(config.timeout_ms, Some(2000));
        assert_eq!(config.options, None);
    }

    #[test]
    fn deserializes_interceptor_config_with_options() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "timeout_ms": 2000,
            "options": {
                "role": "admin",
                "allowed_methods": ["GET", "POST"]
            }
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.module, "./interceptors/auth.js");
        assert_eq!(config.hook, "on_request");
        assert_eq!(config.function, "checkAuth");
        assert_eq!(config.timeout_ms, Some(2000));
        assert!(config.options.is_some());
        let options = config.options.unwrap();
        assert_eq!(options["role"].as_str().unwrap(), "admin");
        assert_eq!(options["allowed_methods"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn timeout_ms_is_optional() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth"
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.timeout_ms, None);
        assert_eq!(config.options, None);
    }
}