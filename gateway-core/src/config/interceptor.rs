use serde::Deserialize;

#[derive(Debug, Deserialize, Default, Clone)]
pub struct PermissionsConfig {
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub read: Vec<String>,
    #[serde(default)]
    pub net: Vec<String>,
}

impl PermissionsConfig {
    pub fn into_runtime_permissions(self) -> opengateway_js_runtime::InterceptorPermissions {
        opengateway_js_runtime::InterceptorPermissions {
            allowed_env_vars: self.env.into_iter().collect(),
            allowed_read_paths: self.read.into_iter().map(std::path::PathBuf::from).collect(),
            allowed_hosts: self.net.into_iter().collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,
    pub hook: String,
    pub function: String,
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub options: Option<serde_json::Value>,
    #[serde(default)]
    pub permissions: Option<PermissionsConfig>,
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

    #[test]
    fn permissions_field_is_optional() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth"
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        assert!(config.permissions.is_none());
    }

    #[test]
    fn deserializes_permissions_config() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "permissions": {
                "env": ["API_KEY", "SECRET_TOKEN"],
                "read": ["/etc/ssl/certs"],
                "net": ["api.example.com", "auth.service.internal"]
            }
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        let perms = config.permissions.unwrap();
        assert_eq!(perms.env.len(), 2);
        assert!(perms.env.contains(&"API_KEY".to_string()));
        assert!(perms.env.contains(&"SECRET_TOKEN".to_string()));
        assert_eq!(perms.read, vec!["/etc/ssl/certs"]);
        assert_eq!(perms.net.len(), 2);
        assert!(perms.net.contains(&"api.example.com".to_string()));
    }

    #[test]
    fn permissions_fields_default_to_empty() {
        let json = serde_json::json!({
            "module": "./interceptors/auth.js",
            "hook": "on_request",
            "function": "checkAuth",
            "permissions": {}
        });
        let config: InterceptorConfig = serde_json::from_value(json).unwrap();
        let perms = config.permissions.unwrap();
        assert!(perms.env.is_empty());
        assert!(perms.read.is_empty());
        assert!(perms.net.is_empty());
    }

    #[test]
    fn into_runtime_permissions_converts_correctly() {
        let perms_config = super::PermissionsConfig {
            env: vec!["MY_VAR".to_string()],
            read: vec!["/tmp".to_string()],
            net: vec!["example.com".to_string()],
        };
        let runtime_perms = perms_config.into_runtime_permissions();
        assert!(runtime_perms.allowed_env_vars.contains("MY_VAR"));
        assert!(runtime_perms.allowed_hosts.contains("example.com"));
        assert!(runtime_perms
            .allowed_read_paths
            .iter()
            .any(|p| p.to_str() == Some("/tmp")));
    }
}
