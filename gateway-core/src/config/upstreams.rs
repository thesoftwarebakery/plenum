use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HttpUpstreamFields {
    address: String,
    port: u16,
    #[serde(default, rename = "buffer-response")]
    buffer_response: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginUpstreamFields {
    plugin: String,
    #[serde(default)]
    options: Option<Value>,
    #[serde(default)]
    permissions: Option<super::PermissionsConfig>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Debug)]
pub enum UpstreamConfig {
    HTTP {
        address: String,
        port: u16,
        buffer_response: bool,
    },
    Plugin {
        plugin: String,
        options: Option<Value>,
        permissions: Option<super::PermissionsConfig>,
        timeout_ms: Option<u64>,
    },
}

impl<'de> serde::Deserialize<'de> for UpstreamConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let mut map =
            serde_json::Map::deserialize(deserializer).map_err(serde::de::Error::custom)?;

        let kind = map
            .remove("kind")
            .ok_or_else(|| serde::de::Error::missing_field("kind"))?;
        let kind_str = kind
            .as_str()
            .ok_or_else(|| serde::de::Error::custom("field `kind` must be a string"))?;

        let remaining = Value::Object(map);

        match kind_str {
            "HTTP" => {
                let fields: HttpUpstreamFields =
                    serde_json::from_value(remaining).map_err(serde::de::Error::custom)?;
                Ok(UpstreamConfig::HTTP {
                    address: fields.address,
                    port: fields.port,
                    buffer_response: fields.buffer_response,
                })
            }
            "plugin" => {
                let fields: PluginUpstreamFields =
                    serde_json::from_value(remaining).map_err(serde::de::Error::custom)?;
                Ok(UpstreamConfig::Plugin {
                    plugin: fields.plugin,
                    options: fields.options,
                    permissions: fields.permissions,
                    timeout_ms: fields.timeout_ms,
                })
            }
            other => Err(serde::de::Error::custom(format!(
                "unknown upstream kind `{other}`; expected `HTTP` or `plugin`"
            ))),
        }
    }
}

/// Replace `${VAR_NAME}` (and `${VAR:-default}`) patterns in a JSON value with environment
/// variable values. Returns an error if a `${VAR}` pattern references an environment variable
/// that is not set at all (use `${VAR:-default}` to provide a fallback). Variables set to `""`
/// (empty string) resolve to `""` without error.
pub fn resolve_env_vars(value: serde_json::Value) -> Result<serde_json::Value, String> {
    match value {
        serde_json::Value::String(s) => Ok(serde_json::Value::String(substitute_env_vars(&s)?)),
        serde_json::Value::Object(map) => {
            let new_map = map
                .into_iter()
                .map(|(k, v)| resolve_env_vars(v).map(|v| (k, v)))
                .collect::<Result<_, _>>()?;
            Ok(serde_json::Value::Object(new_map))
        }
        serde_json::Value::Array(arr) => {
            let new_arr = arr
                .into_iter()
                .map(resolve_env_vars)
                .collect::<Result<_, _>>()?;
            Ok(serde_json::Value::Array(new_arr))
        }
        other => Ok(other),
    }
}

fn substitute_env_vars(s: &str) -> Result<String, String> {
    use std::borrow::Cow;
    // Use Ok(None) for unset variables so that shellexpand's `${VAR:-default}` syntax works:
    // when the lookup returns None, shellexpand applies the `:-` default if present.
    // Variables set to "" return Ok(Some("")) and are passed through without error.
    // Any `${VAR}` (no default) that is unset will be left as the literal `${VAR}` by
    // shellexpand; we then error in a second pass.
    let expanded = shellexpand::env_with_context(
        s,
        |var| -> Result<Option<Cow<str>>, std::convert::Infallible> {
            match std::env::var(var) {
                Ok(val) => Ok(Some(Cow::Owned(val))),
                Err(_) => Ok(None),
            }
        },
    )
    .map(|s| s.into_owned())
    .unwrap_or_else(|_| s.to_string());

    // Second pass: any remaining ${VAR} patterns were left literal by shellexpand because the
    // variable was not set (NotPresent). Error rather than silently substituting empty string.
    if let Some(start) = expanded.find("${") {
        let after_open = &expanded[start + 2..];
        if let Some(end) = after_open.find('}') {
            let var_name = &after_open[..end];
            return Err(format!(
                "environment variable '{}' is not set (use ${{{var_name}:-default}} to provide a fallback)",
                var_name
            ));
        }
    }
    Ok(expanded)
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
            UpstreamConfig::HTTP {
                address,
                port,
                buffer_response,
            } => {
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
            UpstreamConfig::Plugin {
                plugin,
                options,
                permissions,
                timeout_ms,
            } => {
                assert_eq!(plugin, "my-plugin");
                assert!(options.is_some());
                assert_eq!(options.unwrap()["key"], "value");
                assert!(permissions.is_none());
                assert!(timeout_ms.is_none());
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
            UpstreamConfig::Plugin {
                plugin,
                options,
                permissions,
                timeout_ms,
            } => {
                assert_eq!(plugin, "my-plugin");
                assert!(options.is_none());
                assert!(permissions.is_none());
                assert!(timeout_ms.is_none());
            }
            _ => panic!("expected Plugin variant"),
        }
    }

    #[test]
    fn deserializes_plugin_variant_with_timeout_ms() {
        let json = serde_json::json!({
            "kind": "plugin",
            "plugin": "my-plugin",
            "timeout_ms": 7500
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::Plugin {
                plugin,
                options,
                permissions,
                timeout_ms,
            } => {
                assert_eq!(plugin, "my-plugin");
                assert!(options.is_none());
                assert!(permissions.is_none());
                assert_eq!(timeout_ms, Some(7500));
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
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown upstream kind"), "got: {err}");
        assert!(err.contains("HTTP"), "got: {err}");
        assert!(err.contains("plugin"), "got: {err}");
    }

    #[test]
    fn rejects_unknown_field_on_http_variant() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "x",
            "port": 80,
            "buffer-responce": true
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field buffer-responce"
        );
    }

    #[test]
    fn rejects_unknown_field_on_plugin_variant() {
        let json = serde_json::json!({
            "kind": "plugin",
            "plugin": "x",
            "typo_field": 1
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field typo_field"
        );
    }

    #[test]
    fn resolve_env_vars_replaces_present_var() {
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::set_var("OPENGATEWAY_TEST_VAR_PRESENT", "hello") };
        let value = serde_json::json!("prefix_${OPENGATEWAY_TEST_VAR_PRESENT}_suffix");
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!("prefix_hello_suffix"));
    }

    #[test]
    fn resolve_env_vars_errors_on_missing_var() {
        // Ensure the var is definitely unset
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::remove_var("OPENGATEWAY_TEST_VAR_DEFINITELY_MISSING") };
        let value = serde_json::json!("${OPENGATEWAY_TEST_VAR_DEFINITELY_MISSING}");
        let result = resolve_env_vars(value);
        assert!(result.is_err(), "expected Err for unset variable");
        let err = result.unwrap_err();
        assert!(
            err.contains("OPENGATEWAY_TEST_VAR_DEFINITELY_MISSING"),
            "error should mention variable name, got: {err}"
        );
    }

    #[test]
    fn resolve_env_vars_leaves_value_without_patterns_unchanged() {
        let value = serde_json::json!("no substitution here");
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!("no substitution here"));
    }

    #[test]
    fn resolve_env_vars_handles_array_values() {
        // SAFETY: single-threaded test
        unsafe { std::env::set_var("OPENGATEWAY_TEST_ARRAY_VAR", "item") };
        let value = serde_json::json!(["${OPENGATEWAY_TEST_ARRAY_VAR}", "literal"]);
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!(["item", "literal"]));
    }

    #[test]
    fn resolve_env_vars_supports_default_syntax() {
        unsafe { std::env::remove_var("OPENGATEWAY_TEST_DEFAULT_VAR") };
        let value = serde_json::json!("${OPENGATEWAY_TEST_DEFAULT_VAR:-fallback}");
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!("fallback"));
    }

    #[test]
    fn rejects_upstream_config_with_missing_kind() {
        let json = serde_json::json!({ "address": "localhost", "port": 8080 });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("kind"), "got: {err}");
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
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result["inner"]["key"], serde_json::json!("world"));
        assert_eq!(result["outer"], serde_json::json!("plain"));
    }

    #[test]
    fn resolve_env_vars_allows_empty_string_env_var() {
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::set_var("OPENGATEWAY_TEST_EMPTY_STRING_VAR", "") };
        let value = serde_json::json!("${OPENGATEWAY_TEST_EMPTY_STRING_VAR}");
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn resolve_env_vars_allows_explicit_empty_default() {
        // SAFETY: single-threaded test, no other threads reading this var
        unsafe { std::env::remove_var("OPENGATEWAY_TEST_EXPLICIT_EMPTY_DEFAULT_VAR") };
        let value = serde_json::json!("${OPENGATEWAY_TEST_EXPLICIT_EMPTY_DEFAULT_VAR:-}");
        let result = resolve_env_vars(value).unwrap();
        assert_eq!(result, serde_json::json!(""));
    }
}
