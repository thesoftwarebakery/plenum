use serde::Deserialize;

use plenum_config::{ConfigDuration, ContextTemplate};

fn default_true() -> bool {
    true
}

/// Rate limiting configuration for a route operation.
///
/// Applied via the `x-plenum-rate-limit` OpenAPI extension at the path or
/// operation level. Operation-level config overrides path-level config.
///
/// The `identifier` is a [`ContextTemplate`] — a string containing one or more
/// `${{…}}` expressions. Supported tokens are the same as everywhere else in
/// Plenum configuration:
///
/// | Token | Description |
/// |---|---|
/// | `${{header.name}}` | Request header value |
/// | `${{query.key}}` | Query string parameter |
/// | `${{path-param.name}}` | Path parameter from OpenAPI template |
/// | `${{cookie.name}}` | Cookie value |
/// | `${{ctx.dotpath}}` | Value from the request ctx bag set by interceptors |
/// | `${{client-ip}}` | Client IP (XFF first, peer fallback) |
/// | `${{path}}` | Full request path |
/// | `${{method}}` | HTTP method |
///
/// Composite keys are formed by embedding multiple expressions in one string:
///
/// ```yaml
/// x-plenum-rate-limit:
///   - identifier: "${{header.x-tenant}}-${{ctx.userId}}"
///     window: 60s
///     limit: 500
///   - identifier: "${{header.x-tenant}}-${{ctx.userId}}"
///     window: 1h
///     limit: 5000
/// ```
///
/// If any expression in the identifier fails to resolve (e.g. the header is
/// absent), rate limiting is skipped for that request.
#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct RateLimitConfig {
    /// Template for the rate limit key. Parsed and validated at config load
    /// time; an invalid expression or unknown namespace is a boot-time error.
    pub identifier: ContextTemplate,

    /// Window duration. Supported formats: `"500ms"`, `"60s"`, `"5m"`, `"1h"`.
    pub window: ConfigDuration,

    /// Maximum count of events allowed per window.
    pub limit: u64,

    /// Dot-path into the ctx bag for the per-request cost. Defaults to `1`.
    ///
    /// The resolved value must be a positive JSON number; non-numeric or
    /// zero values fall back to `1`.
    #[serde(default)]
    pub cost_ctx_path: Option<String>,

    /// When `true` (default), the gateway rejects over-limit requests with
    /// 429. When `false`, the gateway counts and exposes state via
    /// `input.rateLimits` only — enforcement is left to interceptors.
    #[serde(default = "default_true")]
    pub enforce: bool,
}

/// Validate all rate limit configs for a given path at boot time.
///
/// The `identifier` expression syntax is already validated at deserialization
/// time by [`ContextTemplate`], and `window` is validated by [`ConfigDuration`].
/// This function checks the remaining constraints: non-empty array and
/// `limit > 0`.
pub fn validate_rate_limit_configs(configs: &[RateLimitConfig], path: &str) -> Result<(), String> {
    if configs.is_empty() {
        return Err(format!(
            "path '{path}': x-plenum-rate-limit: array must not be empty"
        ));
    }
    for config in configs {
        if config.limit == 0 {
            return Err(format!(
                "path '{path}': x-plenum-rate-limit: limit must be greater than 0"
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::Duration;

    fn deserialize(v: serde_json::Value) -> serde_json::Result<RateLimitConfig> {
        serde_json::from_value(v)
    }

    #[test]
    fn deserializes_minimal_config() {
        let config = deserialize(json!({
            "identifier": "${{header.x-api-key}}",
            "window": "60s",
            "limit": 1000
        }))
        .unwrap();
        assert_eq!(config.identifier.as_str(), "${{header.x-api-key}}");
        assert_eq!(*config.window, Duration::from_secs(60));
        assert_eq!(config.limit, 1000);
        assert!(config.enforce); // default true
        assert!(config.cost_ctx_path.is_none());
    }

    #[test]
    fn deserializes_full_config() {
        let config = deserialize(json!({
            "identifier": "${{header.x-api-key}}-${{ctx.tenant.id}}",
            "window": "5m",
            "limit": 500,
            "cost_ctx_path": "tokenCost",
            "enforce": false
        }))
        .unwrap();
        assert_eq!(
            config.identifier.as_str(),
            "${{header.x-api-key}}-${{ctx.tenant.id}}"
        );
        assert_eq!(*config.window, Duration::from_secs(300));
        assert_eq!(config.limit, 500);
        assert_eq!(config.cost_ctx_path.as_deref(), Some("tokenCost"));
        assert!(!config.enforce);
    }

    #[test]
    fn enforce_defaults_to_true() {
        let config = deserialize(json!({
            "identifier": "${{client-ip}}",
            "window": "1h",
            "limit": 100
        }))
        .unwrap();
        assert!(config.enforce);
    }

    #[test]
    fn rejects_unknown_field() {
        let result = deserialize(json!({
            "identifier": "${{client-ip}}",
            "window": "60s",
            "limit": 10,
            "unknown": true
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_invalid_identifier_at_deserialization() {
        let result = deserialize(json!({
            "identifier": "static-key",
            "window": "60s",
            "limit": 10
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_unknown_namespace_at_deserialization() {
        let result = deserialize(json!({
            "identifier": "${{unknown.x}}",
            "window": "60s",
            "limit": 10
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_invalid_window_at_deserialization() {
        let result = deserialize(json!({
            "identifier": "${{client-ip}}",
            "window": "abc",
            "limit": 10
        }));
        assert!(result.is_err());
    }

    // -- validate_rate_limit_configs --

    #[test]
    fn validate_configs_passes_single() {
        let configs = vec![
            deserialize(json!({
                "identifier": "${{header.x-api-key}}",
                "window": "60s",
                "limit": 1
            }))
            .unwrap(),
        ];
        assert!(validate_rate_limit_configs(&configs, "/test").is_ok());
    }

    #[test]
    fn validate_configs_passes_multiple() {
        let configs = vec![
            deserialize(json!({
                "identifier": "${{header.x-api-key}}",
                "window": "60s",
                "limit": 100
            }))
            .unwrap(),
            deserialize(json!({
                "identifier": "${{header.x-api-key}}",
                "window": "1h",
                "limit": 1000
            }))
            .unwrap(),
        ];
        assert!(validate_rate_limit_configs(&configs, "/test").is_ok());
    }

    #[test]
    fn validate_configs_rejects_empty() {
        let err = validate_rate_limit_configs(&[], "/test").unwrap_err();
        assert!(err.contains("must not be empty"), "{err}");
    }

    #[test]
    fn validate_configs_rejects_if_any_invalid() {
        let configs = vec![
            deserialize(json!({
                "identifier": "${{header.x-api-key}}",
                "window": "60s",
                "limit": 100
            }))
            .unwrap(),
            deserialize(json!({
                "identifier": "${{header.x-api-key}}",
                "window": "60s",
                "limit": 0
            }))
            .unwrap(),
        ];
        let err = validate_rate_limit_configs(&configs, "/test").unwrap_err();
        assert!(err.contains("limit must be greater than 0"), "{err}");
    }
}
