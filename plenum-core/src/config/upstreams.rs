use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

use crate::request_context::ContextRef;

// ---------------------------------------------------------------------------
// Selection algorithm
// ---------------------------------------------------------------------------

/// Backend selection strategy for multi-upstream HTTP routes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SelectionAlgorithm {
    #[default]
    RoundRobin,
    Weighted,
    Consistent,
}

impl SelectionAlgorithm {
    fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "round-robin" => Ok(Self::RoundRobin),
            "weighted" => Ok(Self::Weighted),
            "consistent" => Ok(Self::Consistent),
            other => Err(format!(
                "unknown selection algorithm '{other}'; expected \
                 'round-robin', 'weighted', or 'consistent'"
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Health check config
// ---------------------------------------------------------------------------

fn default_hc_interval() -> u64 {
    10
}
fn default_hc_status() -> u16 {
    200
}
fn default_one() -> usize {
    1
}

/// Active health check configuration for multi-upstream HTTP routes.
#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct HealthCheckConfig {
    pub path: String,
    #[serde(default = "default_hc_interval", rename = "interval-seconds")]
    pub interval_seconds: u64,
    #[serde(default = "default_hc_status", rename = "expected-status")]
    pub expected_status: u16,
    #[serde(default = "default_one", rename = "consecutive-success")]
    pub consecutive_success: usize,
    #[serde(default = "default_one", rename = "consecutive-failure")]
    pub consecutive_failure: usize,
}

// ---------------------------------------------------------------------------
// Backend entry
// ---------------------------------------------------------------------------

fn default_weight() -> usize {
    1
}

/// A single backend in a multi-upstream pool.
#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct BackendEntry {
    pub address: String,
    pub port: u16,
    #[serde(default = "default_weight")]
    pub weight: usize,
}

// ---------------------------------------------------------------------------
// Serde helper structs (private)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HttpUpstreamFields {
    address: String,
    port: u16,
    #[serde(default, rename = "buffer-response")]
    buffer_response: bool,
    #[serde(default)]
    tls: bool,
    #[serde(default, rename = "tls-verify")]
    tls_verify: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HttpPoolUpstreamFields {
    backends: Vec<BackendEntry>,
    #[serde(default, rename = "buffer-response")]
    buffer_response: bool,
    #[serde(default)]
    tls: bool,
    #[serde(default, rename = "tls-verify")]
    tls_verify: Option<bool>,
    #[serde(default)]
    selection: Option<String>,
    #[serde(default, rename = "hash-key")]
    hash_key: Option<String>,
    #[serde(default, rename = "health-check")]
    health_check: Option<HealthCheckConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginUpstreamFields {
    plugin: String,
    #[serde(default)]
    options: Option<Value>,
    #[serde(default)]
    permissions: Option<super::PermissionsConfig>,
    #[serde(default, rename = "timeout-ms")]
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StaticUpstreamFields {
    status: u16,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    body: Option<String>,
}

// ---------------------------------------------------------------------------
// UpstreamConfig
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum UpstreamConfig {
    /// Single HTTP upstream — direct proxy with zero load-balancing overhead.
    HTTP {
        address: String,
        port: u16,
        buffer_response: bool,
        tls: bool,
        /// `None` means "use default" (true). Only takes effect when `tls` is true.
        tls_verify: Option<bool>,
    },
    /// Multi-upstream HTTP pool with load balancing and optional health checks.
    HTTPPool {
        backends: Vec<BackendEntry>,
        buffer_response: bool,
        tls: bool,
        tls_verify: Option<bool>,
        selection: SelectionAlgorithm,
        /// Parsed `${{...}}` context reference for consistent hashing key.
        hash_key: Option<ContextRef>,
        health_check: Option<HealthCheckConfig>,
    },
    Plugin {
        plugin: String,
        options: Option<Value>,
        permissions: Option<super::PermissionsConfig>,
        timeout_ms: Option<u64>,
    },
    Static {
        status: u16,
        headers: Option<HashMap<String, String>>,
        body: Option<String>,
    },
}

impl UpstreamConfig {
    /// Emit any security-relevant warnings for this upstream configuration.
    /// Call once per route at startup after the config has been parsed.
    pub fn emit_security_warnings(&self, path: &str) {
        match self {
            UpstreamConfig::HTTP {
                tls_verify: Some(false),
                address,
                port,
                ..
            } => {
                log::warn!(
                    "path '{}': TLS VERIFICATION DISABLED for upstream \
                     {}:{} — DO NOT USE IN PRODUCTION",
                    path,
                    address,
                    port
                );
            }
            UpstreamConfig::HTTPPool {
                tls_verify: Some(false),
                backends,
                ..
            } => {
                let addrs: Vec<String> = backends
                    .iter()
                    .map(|b| format!("{}:{}", b.address, b.port))
                    .collect();
                log::warn!(
                    "path '{}': TLS VERIFICATION DISABLED for upstream pool \
                     [{}] — DO NOT USE IN PRODUCTION",
                    path,
                    addrs.join(", ")
                );
            }
            _ => {}
        }
    }
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
                // Discriminate single vs multi-upstream by presence of `backends`.
                let has_backends = remaining
                    .as_object()
                    .map(|m| m.contains_key("backends"))
                    .unwrap_or(false);

                if has_backends {
                    let fields: HttpPoolUpstreamFields =
                        serde_json::from_value(remaining).map_err(serde::de::Error::custom)?;
                    if fields.tls_verify.is_some() && !fields.tls {
                        return Err(serde::de::Error::custom(
                            "`tls-verify` is set but `tls` is false — \
                             `tls-verify` only applies when `tls: true`",
                        ));
                    }
                    if fields.backends.is_empty() {
                        return Err(serde::de::Error::custom(
                            "`backends` must contain at least one entry",
                        ));
                    }
                    let selection = match &fields.selection {
                        Some(s) => {
                            SelectionAlgorithm::from_str(s).map_err(serde::de::Error::custom)?
                        }
                        None => SelectionAlgorithm::default(),
                    };
                    // Validate hash-key: only allowed with consistent hashing
                    let hash_key = match fields.hash_key {
                        Some(ref token) => {
                            if selection != SelectionAlgorithm::Consistent {
                                return Err(serde::de::Error::custom(
                                    "`hash-key` is only valid when `selection: consistent`",
                                ));
                            }
                            Some(ContextRef::parse(token).map_err(serde::de::Error::custom)?)
                        }
                        None => None,
                    };
                    Ok(UpstreamConfig::HTTPPool {
                        backends: fields.backends,
                        buffer_response: fields.buffer_response,
                        tls: fields.tls,
                        tls_verify: fields.tls_verify,
                        selection,
                        hash_key,
                        health_check: fields.health_check,
                    })
                } else {
                    let fields: HttpUpstreamFields =
                        serde_json::from_value(remaining).map_err(serde::de::Error::custom)?;
                    if fields.tls_verify.is_some() && !fields.tls {
                        return Err(serde::de::Error::custom(
                            "`tls-verify` is set but `tls` is false — \
                             `tls-verify` only applies when `tls: true`",
                        ));
                    }
                    Ok(UpstreamConfig::HTTP {
                        address: fields.address,
                        port: fields.port,
                        buffer_response: fields.buffer_response,
                        tls: fields.tls,
                        tls_verify: fields.tls_verify,
                    })
                }
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
            "static" => {
                let fields: StaticUpstreamFields =
                    serde_json::from_value(remaining).map_err(serde::de::Error::custom)?;
                Ok(UpstreamConfig::Static {
                    status: fields.status,
                    headers: fields.headers,
                    body: fields.body,
                })
            }
            other => Err(serde::de::Error::custom(format!(
                "unknown upstream kind `{other}`; expected `HTTP`, `plugin`, or `static`"
            ))),
        }
    }
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
                tls,
                tls_verify,
            } => {
                assert_eq!(address, "127.0.0.1");
                assert_eq!(port, 8080);
                assert!(!buffer_response);
                assert!(!tls);
                assert!(tls_verify.is_none());
            }
            _ => panic!("expected HTTP variant"),
        }
    }

    #[test]
    fn deserializes_http_variant_with_tls() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "api.example.com",
            "port": 443,
            "tls": true
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTP {
                tls, tls_verify, ..
            } => {
                assert!(tls);
                assert!(tls_verify.is_none());
            }
            _ => panic!("expected HTTP variant"),
        }
    }

    #[test]
    fn deserializes_http_variant_with_tls_verify_false() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "api.example.com",
            "port": 443,
            "tls": true,
            "tls-verify": false
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTP {
                tls, tls_verify, ..
            } => {
                assert!(tls);
                assert_eq!(tls_verify, Some(false));
            }
            _ => panic!("expected HTTP variant"),
        }
    }

    #[test]
    fn rejects_tls_verify_unknown_field() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "x",
            "port": 80,
            "tls-verfy": true
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for misspelled tls-verfy");
    }

    #[test]
    fn rejects_tls_verify_without_tls() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "127.0.0.1",
            "port": 80,
            "tls-verify": false
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error when tls-verify is set without tls: true"
        );
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("tls-verify"),
            "error should mention tls-verify, got: {err}"
        );
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
            "timeout-ms": 7500
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
        assert!(err.contains("static"), "got: {err}");
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
    fn rejects_upstream_config_with_missing_kind() {
        let json = serde_json::json!({ "address": "localhost", "port": 8080 });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("kind"), "got: {err}");
    }

    #[test]
    fn deserializes_static_variant_with_all_fields() {
        let json = serde_json::json!({
            "kind": "static",
            "status": 201,
            "headers": { "Content-Type": "application/json" },
            "body": "{\"created\": true}"
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::Static {
                status,
                headers,
                body,
            } => {
                assert_eq!(status, 201);
                let h = headers.unwrap();
                assert_eq!(h.get("Content-Type").unwrap(), "application/json");
                assert_eq!(body.unwrap(), "{\"created\": true}");
            }
            _ => panic!("expected Static variant"),
        }
    }

    #[test]
    fn rejects_static_variant_without_status() {
        let json = serde_json::json!({ "kind": "static" });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("status"), "got: {err}");
    }

    #[test]
    fn deserializes_static_variant_with_status_only() {
        let json = serde_json::json!({ "kind": "static", "status": 204 });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::Static {
                status,
                headers,
                body,
            } => {
                assert_eq!(status, 204);
                assert!(headers.is_none());
                assert!(body.is_none());
            }
            _ => panic!("expected Static variant"),
        }
    }

    #[test]
    fn rejects_unknown_field_on_static_variant() {
        let json = serde_json::json!({
            "kind": "static",
            "status": 200,
            "typo_field": 1
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field typo_field"
        );
    }

    // -----------------------------------------------------------------------
    // HTTPPool (multi-upstream) tests
    // -----------------------------------------------------------------------

    #[test]
    fn deserializes_http_pool_round_robin() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "backends": [
                { "address": "api-1", "port": 8080 },
                { "address": "api-2", "port": 8080 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool {
                backends,
                selection,
                health_check,
                hash_key,
                tls,
                ..
            } => {
                assert_eq!(backends.len(), 2);
                assert_eq!(backends[0].address, "api-1");
                assert_eq!(backends[1].address, "api-2");
                assert_eq!(backends[0].weight, 1); // default
                assert_eq!(selection, SelectionAlgorithm::RoundRobin);
                assert!(health_check.is_none());
                assert!(hash_key.is_none());
                assert!(!tls);
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn deserializes_http_pool_weighted() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "selection": "weighted",
            "backends": [
                { "address": "api-1", "port": 8080, "weight": 5 },
                { "address": "api-2", "port": 8080, "weight": 3 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool {
                backends,
                selection,
                ..
            } => {
                assert_eq!(selection, SelectionAlgorithm::Weighted);
                assert_eq!(backends[0].weight, 5);
                assert_eq!(backends[1].weight, 3);
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn deserializes_http_pool_consistent_with_hash_key() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "selection": "consistent",
            "hash-key": "${{header.x-user-id}}",
            "backends": [
                { "address": "cache-1", "port": 8080 },
                { "address": "cache-2", "port": 8080 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool {
                selection,
                hash_key,
                ..
            } => {
                assert_eq!(selection, SelectionAlgorithm::Consistent);
                assert!(hash_key.is_some());
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn deserializes_http_pool_with_health_check() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "health-check": {
                "path": "/healthz",
                "interval-seconds": 5,
                "expected-status": 200,
                "consecutive-success": 2,
                "consecutive-failure": 3
            },
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool { health_check, .. } => {
                let hc = health_check.unwrap();
                assert_eq!(hc.path, "/healthz");
                assert_eq!(hc.interval_seconds, 5);
                assert_eq!(hc.expected_status, 200);
                assert_eq!(hc.consecutive_success, 2);
                assert_eq!(hc.consecutive_failure, 3);
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn health_check_defaults() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "health-check": { "path": "/health" },
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool { health_check, .. } => {
                let hc = health_check.unwrap();
                assert_eq!(hc.interval_seconds, 10);
                assert_eq!(hc.expected_status, 200);
                assert_eq!(hc.consecutive_success, 1);
                assert_eq!(hc.consecutive_failure, 1);
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn rejects_empty_backends() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "backends": []
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("at least one entry"),
            "expected error about empty backends, got: {err}"
        );
    }

    #[test]
    fn rejects_hash_key_without_consistent() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "selection": "round-robin",
            "hash-key": "${{header.x-user-id}}",
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("hash-key"),
            "expected error about hash-key, got: {err}"
        );
    }

    #[test]
    fn rejects_invalid_hash_key_token() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "selection": "consistent",
            "hash-key": "not-a-token",
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for invalid hash-key token");
    }

    #[test]
    fn rejects_unknown_selection_algorithm() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "selection": "least-connections",
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown selection algorithm"), "got: {err}");
    }

    #[test]
    fn rejects_tls_verify_without_tls_on_pool() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "tls-verify": false,
            "backends": [
                { "address": "api-1", "port": 8080 }
            ]
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("tls-verify"),
            "expected error about tls-verify, got: {err}"
        );
    }

    #[test]
    fn http_pool_with_tls() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "tls": true,
            "tls-verify": false,
            "backends": [
                { "address": "api-1", "port": 443 }
            ]
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        match config {
            UpstreamConfig::HTTPPool {
                tls, tls_verify, ..
            } => {
                assert!(tls);
                assert_eq!(tls_verify, Some(false));
            }
            _ => panic!("expected HTTPPool variant"),
        }
    }

    #[test]
    fn single_http_still_works_unchanged() {
        // Ensure the existing single-upstream path isn't broken
        let json = serde_json::json!({
            "kind": "HTTP",
            "address": "127.0.0.1",
            "port": 8080
        });
        let config: UpstreamConfig = serde_json::from_value(json).unwrap();
        assert!(matches!(config, UpstreamConfig::HTTP { .. }));
    }

    #[test]
    fn rejects_unknown_field_on_pool_variant() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "backends": [{ "address": "x", "port": 80 }],
            "typo_field": true
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field typo_field"
        );
    }

    #[test]
    fn rejects_unknown_field_on_backend_entry() {
        let json = serde_json::json!({
            "kind": "HTTP",
            "backends": [{ "address": "x", "port": 80, "priority": 1 }]
        });
        let result: Result<UpstreamConfig, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "expected error for unknown field on backend entry"
        );
    }
}
