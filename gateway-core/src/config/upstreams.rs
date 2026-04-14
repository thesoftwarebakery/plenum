use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum UpstreamConfig {
    #[serde(rename = "HTTP")]
    HTTP {
        address: String,
        port: u16,
        #[serde(default, rename = "buffer-response")]
        buffer_response: bool,
    },
    #[serde(rename = "plugin")]
    Plugin {
        plugin: String,
        #[serde(default)]
        options: Option<serde_json::Value>,
        #[serde(default)]
        permissions: Option<super::PermissionsConfig>,
    },
}

// TODO: called in build_router for Plugin upstream options
/// Replace `${VAR_NAME}` patterns in a JSON value with environment variable values.
/// Missing variables resolve to empty string with a warning log.
pub fn resolve_env_vars(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => serde_json::Value::String(substitute_env_vars(&s)),
        serde_json::Value::Object(map) => {
            let new_map = map
                .into_iter()
                .map(|(k, v)| (k, resolve_env_vars(v)))
                .collect();
            serde_json::Value::Object(new_map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(resolve_env_vars).collect())
        }
        other => other,
    }
}

fn substitute_env_vars(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut rest = s;

    while let Some(start) = rest.find("${") {
        // Push everything before the `${`
        result.push_str(&rest[..start]);
        let after_open = &rest[start + 2..];

        if let Some(end) = after_open.find('}') {
            let var_name = &after_open[..end];
            match std::env::var(var_name) {
                Ok(val) => result.push_str(&val),
                Err(_) => {
                    log::warn!("env var '{}' not set; substituting empty string", var_name);
                }
            }
            rest = &after_open[end + 1..];
        } else {
            // No closing `}` -- treat as literal and stop scanning
            result.push_str(&rest[start..]);
            return result;
        }
    }

    result.push_str(rest);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_http_variant() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "127.0.0.1",
            "port": 8080
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTP { address, port, buffer_response } => {
                assert_eq!(address, "127.0.0.1");
                assert_eq!(port, 8080);
                assert!(!buffer_response);
            }
            _ => panic!("expected HTTP variant"),
        }
    }

    #[test]
    fn deserializes_plugin_variant_with_options() {
        let json = serde_json::json!({
            "kind": "plugin",
            "plugin": "my-plugin",
            "options": { "key": "value" }
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::Plugin { plugin, options, permissions } => {
                assert_eq!(plugin, "my-plugin");
                assert!(options.is_some());
                assert_eq!(options.unwrap()["key"], "value");
                assert!(permissions.is_none());
            }
            _ => panic!("expected Plugin variant"),
        }
    }

    #[test]
    fn deserializes_plugin_variant_without_options() {
        let json = serde_json::json!({
            "kind": "plugin",
            "plugin": "my-plugin"
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::Plugin { plugin, options, permissions } => {
                assert_eq!(plugin, "my-plugin");
                assert!(options.is_none());
                assert!(permissions.is_none());
            }
            _ => panic!("expected Plugin variant"),
        }
    }

    #[test]
    fn rejects_unknown_kind() {
        let json = serde_json::json!({
            "kind": "grpc",
            "address": "127.0.0.1",
            "port": 9090
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(result.is_err());
    }

    #[test]
    fn resolve_env_vars_replaces_present_var() {
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::set_var("OPENGATEWAY_TEST_VAR_PRESENT", "hello") };
        let value = serde_json::json!("prefix_${OPENGATEWAY_TEST_VAR_PRESENT}_suffix");
        let result = resolve_env_vars(value);
        assert_eq!(result, serde_json::json!("prefix_hello_suffix"));
    }

    #[test]
    fn resolve_env_vars_replaces_missing_var_with_empty_string() {
        // Ensure the var is definitely unset
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::remove_var("OPENGATEWAY_TEST_VAR_DEFINITELY_MISSING") };
        let value = serde_json::json!("${OPENGATEWAY_TEST_VAR_DEFINITELY_MISSING}");
        let result = resolve_env_vars(value);
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn resolve_env_vars_leaves_value_without_patterns_unchanged() {
        let value = serde_json::json!("no substitution here");
        let result = resolve_env_vars(value);
        assert_eq!(result, serde_json::json!("no substitution here"));
    }

    #[test]
    fn resolve_env_vars_handles_array_values() {
        // SAFETY: single-threaded test
        unsafe { std::env::set_var("OPENGATEWAY_TEST_ARRAY_VAR", "item") };
        let value = serde_json::json!(["${OPENGATEWAY_TEST_ARRAY_VAR}", "literal"]);
        let result = resolve_env_vars(value);
        assert_eq!(result, serde_json::json!(["item", "literal"]));
    }

    #[test]
    fn rejects_upstream_config_with_missing_kind() {
        let json = serde_json::json!({ "address": "localhost", "port": 8080 });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(result.is_err());
    }

    #[test]
    fn resolve_env_vars_handles_nested_objects() {
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::set_var("OPENGATEWAY_TEST_NESTED_VAR", "world") };
        let value = serde_json::json!({
            "outer": "plain",
            "inner": {
                "key": "${OPENGATEWAY_TEST_NESTED_VAR}"
            }
        });
        let result = resolve_env_vars(value);
        assert_eq!(result["inner"]["key"], serde_json::json!("world"));
        assert_eq!(result["outer"], serde_json::json!("plain"));
    }
}
