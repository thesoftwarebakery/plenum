use serde::Deserialize;
use std::time::Duration;

use plenum_config::ContextTemplate;

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
///   identifier: "${{header.x-tenant}}-${{ctx.userId}}"
///   window: 60s
///   limit: 500
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

    /// Window duration string. Supported formats: `"60s"`, `"5m"`, `"1h"`.
    pub window: String,

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

/// Parse a window duration string into a `Duration`.
///
/// Accepts `"Ns"` (seconds), `"Nm"` (minutes), or `"Nh"` (hours).
pub fn parse_window_duration(s: &str) -> Result<Duration, String> {
    let s = s.trim();
    if let Some(n) = s.strip_suffix('s') {
        let secs: u64 = n
            .parse()
            .map_err(|_| format!("invalid window duration: '{s}'"))?;
        return Ok(Duration::from_secs(secs));
    }
    if let Some(n) = s.strip_suffix('m') {
        let mins: u64 = n
            .parse()
            .map_err(|_| format!("invalid window duration: '{s}'"))?;
        return Ok(Duration::from_secs(mins * 60));
    }
    if let Some(n) = s.strip_suffix('h') {
        let hours: u64 = n
            .parse()
            .map_err(|_| format!("invalid window duration: '{s}'"))?;
        return Ok(Duration::from_secs(hours * 3600));
    }
    Err(format!(
        "invalid window duration: '{s}' — must be a number followed by s, m, or h (e.g. '60s', '5m', '1h')"
    ))
}

/// Validate a `RateLimitConfig` at boot time.
///
/// The `identifier` expression syntax is already validated at deserialization
/// time by [`ContextTemplate`]. This function checks the remaining constraints:
/// `limit > 0` and a parseable `window`.
pub fn validate_rate_limit_config(config: &RateLimitConfig, path: &str) -> Result<(), String> {
    if config.limit == 0 {
        return Err(format!(
            "path '{path}': x-plenum-rate-limit: limit must be greater than 0"
        ));
    }
    parse_window_duration(&config.window)
        .map_err(|e| format!("path '{path}': x-plenum-rate-limit: window: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
        assert_eq!(config.window, "60s");
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
        assert_eq!(config.window, "5m");
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
        // Unknown namespace — caught at config parse time, not validation time.
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
    fn parse_window_seconds() {
        assert_eq!(
            parse_window_duration("60s").unwrap(),
            Duration::from_secs(60)
        );
        assert_eq!(parse_window_duration("1s").unwrap(), Duration::from_secs(1));
    }

    #[test]
    fn parse_window_minutes() {
        assert_eq!(
            parse_window_duration("5m").unwrap(),
            Duration::from_secs(300)
        );
        assert_eq!(
            parse_window_duration("1m").unwrap(),
            Duration::from_secs(60)
        );
    }

    #[test]
    fn parse_window_hours() {
        assert_eq!(
            parse_window_duration("1h").unwrap(),
            Duration::from_secs(3600)
        );
        assert_eq!(
            parse_window_duration("2h").unwrap(),
            Duration::from_secs(7200)
        );
    }

    #[test]
    fn parse_window_invalid() {
        assert!(parse_window_duration("60").is_err());
        assert!(parse_window_duration("abc").is_err());
        assert!(parse_window_duration("").is_err());
        assert!(parse_window_duration("xm").is_err());
    }

    #[test]
    fn validate_passes_valid_config() {
        let config = deserialize(json!({
            "identifier": "${{header.x-api-key}}",
            "window": "60s",
            "limit": 1
        }))
        .unwrap();
        assert!(validate_rate_limit_config(&config, "/test").is_ok());
    }

    #[test]
    fn validate_rejects_zero_limit() {
        let config = deserialize(json!({
            "identifier": "${{client-ip}}",
            "window": "60s",
            "limit": 0
        }))
        .unwrap();
        let err = validate_rate_limit_config(&config, "/test").unwrap_err();
        assert!(err.contains("limit must be greater than 0"), "{err}");
    }

    #[test]
    fn validate_rejects_invalid_window() {
        let config = deserialize(json!({
            "identifier": "${{client-ip}}",
            "window": "abc",
            "limit": 10
        }))
        .unwrap();
        let err = validate_rate_limit_config(&config, "/test").unwrap_err();
        assert!(err.contains("window"), "{err}");
    }
}
