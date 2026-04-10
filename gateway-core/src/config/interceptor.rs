use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,
    pub hook: String,
    pub function: String,
    pub timeout_ms: Option<u64>,
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
    }
}
