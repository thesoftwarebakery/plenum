use super::interceptor::GlobalInterceptorConfig;
use serde::Deserialize;

fn default_threads() -> usize {
    1
}
fn default_listen() -> String {
    "0.0.0.0:6188".to_string()
}
fn default_tls_listen() -> String {
    "0.0.0.0:6189".to_string()
}
fn default_timeout_ms() -> u64 {
    30_000
}
fn default_max_body_bytes() -> u64 {
    10_485_760
}
fn default_sample_rate() -> f64 {
    1.0
}
fn default_service_name() -> String {
    "plenum".to_string()
}

/// TLS termination configuration for the inbound listener.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TlsListenerConfig {
    /// Path to the PEM-encoded certificate file. Relative paths are resolved
    /// against the config directory. Use `${{ file.NAME.path }}` to reference
    /// files declared in `x-plenum-files`.
    pub cert: String,
    /// Path to the PEM-encoded private key file. Relative paths are resolved
    /// against the config directory. Use `${{ file.NAME.path }}` to reference
    /// files declared in `x-plenum-files`.
    pub key: String,
    /// Address and port for the TLS listener. Defaults to `"0.0.0.0:6189"`.
    #[serde(default = "default_tls_listen")]
    pub listen: String,
}

/// OpenTelemetry distributed tracing configuration.
///
/// When enabled, the gateway exports trace spans via OTLP gRPC to an
/// external collector (Jaeger, Tempo, Honeycomb, Datadog via OTLP, etc.).
///
/// ## Spans emitted
///
/// - **`http.request`** — top-level span covering the full request lifecycle,
///   carrying `http.method`, `http.route`, `http.status_code`, and `otel.kind`.
/// - **`route_match`** — child span for route resolution.
/// - **`interceptor_call`** — child span per interceptor invocation, with
///   `hook` (lifecycle phase) and `function` (JS function name) fields.
///
/// ## Trace context propagation
///
/// - Incoming `traceparent` / `tracestate` headers (W3C Trace Context) are
///   extracted and used to parent the request span, joining existing traces.
/// - Outgoing upstream requests receive `traceparent` / `tracestate` headers
///   so downstream services can continue the trace.
/// - When no incoming trace context is present, a new trace is started.
///
/// ## Compatibility
///
/// Not compatible with `daemon: true` — the `fork()` call used for
/// daemonization kills the background export thread. Use a process
/// manager (systemd, Docker, Kubernetes) instead.
///
/// ## Example
///
/// ```yaml
/// x-plenum-config:
///   tracing:
///     enabled: true
///     endpoint: "http://otel-collector:4317"
///     sample-rate: 0.5
///     service-name: "my-gateway"
/// ```
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TracingConfig {
    /// Whether OTLP trace export is enabled. Default `false`.
    /// When `false`, the `fmt` log layer is still active (controlled by
    /// `RUST_LOG`) but no spans are exported to the collector.
    #[serde(default)]
    pub enabled: bool,
    /// OTLP gRPC endpoint (e.g. `"http://localhost:4317"`).
    /// This is the address of the OpenTelemetry Collector or compatible backend.
    pub endpoint: String,
    /// Trace sampling rate from `0.0` (drop everything) to `1.0` (keep
    /// everything). Uses the `TraceIdRatioBased` sampler — a value of `0.25`
    /// means roughly 25% of traces are kept. Default `1.0`.
    #[serde(default = "default_sample_rate", rename = "sample-rate")]
    pub sample_rate: f64,
    /// Service name reported in the `service.name` resource attribute on all
    /// exported spans. Default `"plenum"`.
    #[serde(default = "default_service_name", rename = "service-name")]
    pub service_name: String,
}

/// Access log configuration. When present, one structured log line is emitted
/// per completed request using the provided format template.
///
/// The format string uses Plenum's standard `${{ }}` interpolation syntax.
/// String token values are automatically JSON-escaped (quotes, backslashes,
/// control characters) so that JSON-formatted templates remain valid even
/// when values contain special characters. Numeric tokens (`status`,
/// `latency_ms`) are interpolated as raw numbers without escaping.
///
/// ## Available tokens
///
/// ### Request tokens (resolved from the incoming request)
///
/// | Token | Type | Description |
/// |---|---|---|
/// | `${{ method }}` | string | HTTP method (GET, POST, etc.) |
/// | `${{ path }}` | string | Full request path (percent-encoded) |
/// | `${{ client-ip }}` | string | Client IP — prefers `X-Forwarded-For`, falls back to peer address |
/// | `${{ header.NAME }}` | string | Request header value (case-insensitive name) |
/// | `${{ query.KEY }}` | string | Query string parameter value |
/// | `${{ path-param.NAME }}` | string | Path parameter from the OpenAPI route template |
/// | `${{ cookie.NAME }}` | string | Cookie value |
/// | `${{ ctx.DOTPATH }}` | string | Value from the interceptor context bag (dot-path: `ctx.auth.userId`) |
///
/// ### Response tokens (resolved after the request completes)
///
/// | Token | Type | Description |
/// |---|---|---|
/// | `${{ status }}` | number | HTTP response status code |
/// | `${{ latency_ms }}` | number | Request duration in milliseconds |
/// | `${{ route }}` | string | Matched OpenAPI route pattern (e.g. `/products/{id}`) |
/// | `${{ trace_id }}` | string | OpenTelemetry trace ID (empty when tracing is disabled) |
/// | `${{ upstream }}` | string | Selected upstream backend address (`ip:port`) |
///
/// ## Example
///
/// ```yaml
/// x-plenum-config:
///   access-log:
///     format: '{"method":"${{ method }}","path":"${{ path }}","status":${{ status }},"latency_ms":${{ latency_ms }},"trace_id":"${{ trace_id }}"}'
/// ```
///
/// Produces log lines like:
/// ```text
/// {"method":"GET","path":"/products","status":200,"latency_ms":12,"trace_id":"0af7651916cd43dd8448eb211c80319c"}
/// ```
///
/// The log line is emitted at `info` level with the `access_log` target,
/// so it can be filtered independently via `RUST_LOG` (e.g.
/// `RUST_LOG=warn,access_log=info` to suppress other info logs but keep
/// access logs).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccessLogConfig {
    /// Template string using `${{ }}` interpolation tokens.
    /// See the struct-level documentation for the full list of available tokens.
    pub format: String,
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
    #[serde(
        default = "default_timeout_ms",
        rename = "interceptor-default-timeout-ms"
    )]
    pub interceptor_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms", rename = "plugin-default-timeout-ms")]
    pub plugin_default_timeout_ms: u64,
    #[serde(default = "default_timeout_ms", rename = "request-timeout-ms")]
    pub request_timeout_ms: u64,
    #[serde(default = "default_max_body_bytes", rename = "max-request-body-bytes")]
    pub max_request_body_bytes: u64,
    /// Inbound TLS listener configuration. When present, the gateway also
    /// listens for HTTPS connections in addition to the plain TCP listener.
    #[serde(default)]
    pub tls: Option<TlsListenerConfig>,
    /// Path to a PEM CA bundle used to verify outbound HTTPS upstream
    /// connections. When absent, the system trust store is used. All upstreams
    /// share this CA store — per-route CA scoping is not yet supported.
    /// Relative paths are resolved against the config directory.
    /// Use `${{ file.NAME.path }}` to reference files declared in `x-plenum-files`.
    #[serde(default)]
    pub ca: Option<String>,
    /// Global `on_gateway_error` interceptor. When present, all gateway-originated
    /// error responses pass through this interceptor before being written to the client.
    #[serde(default, rename = "on-gateway-error")]
    pub on_gateway_error: Option<GlobalInterceptorConfig>,
    /// OpenTelemetry tracing configuration. When present and enabled, spans
    /// are exported via OTLP gRPC to the configured collector endpoint.
    #[serde(default)]
    pub tracing: Option<TracingConfig>,
    /// Access log configuration. When present, one structured log line is
    /// emitted per completed request using the provided format template.
    #[serde(default, rename = "access-log")]
    pub access_log: Option<AccessLogConfig>,
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
            tls: None,
            ca: None,
            on_gateway_error: None,
            tracing: None,
            access_log: None,
        }
    }
}

impl ServerConfig {
    /// Expand env vars, resolve relative paths against `config_base`, and
    /// validate that all configured cert/key/CA files exist on disk.
    ///
    /// Call this once after deserialization, before using any path fields.
    pub fn resolve_paths(&mut self, config_base: &str) -> Result<(), String> {
        if let Some(tls) = self.tls.as_mut() {
            tls.cert = resolve_path_field(&tls.cert, config_base, "tls.cert")?;
            tls.key = resolve_path_field(&tls.key, config_base, "tls.key")?;
        }
        if let Some(ca) = self.ca.as_mut() {
            *ca = resolve_path_field(ca, config_base, "ca")?;
        }
        Ok(())
    }
}

/// Resolve `s` relative to `config_base` if not absolute, then verify the
/// resulting path exists. Returns the final absolute path.
///
/// Note: `${{ env.* }}` / `${{ file.* }}` interpolation is handled earlier by
/// `Config::resolve()` before the value reaches this function.
fn resolve_path_field(s: &str, config_base: &str, field: &str) -> Result<String, String> {
    // Resolve relative paths against the config directory.
    let path = if std::path::Path::new(s).is_absolute() {
        s.to_string()
    } else {
        std::path::Path::new(config_base)
            .join(s)
            .to_string_lossy()
            .into_owned()
    };

    // Fail loudly before pingora gets a chance to panic on a missing file.
    if !std::path::Path::new(&path).exists() {
        return Err(format!("{field} not found: {path}"));
    }

    Ok(path)
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
            "interceptor-default-timeout-ms": 5000
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
            "plugin-default-timeout-ms": 3000
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
            "request-timeout-ms": 10000
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
            "max-request-body-bytes": 1048576
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

    #[test]
    fn tls_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.tls.is_none());
    }

    #[test]
    fn ca_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.ca.is_none());
    }

    #[test]
    fn deserializes_tls_config() {
        let json = serde_json::json!({
            "tls": {
                "cert": "/etc/ssl/cert.pem",
                "key": "/etc/ssl/key.pem"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tls = config.tls.unwrap();
        assert_eq!(tls.cert, "/etc/ssl/cert.pem");
        assert_eq!(tls.key, "/etc/ssl/key.pem");
        assert_eq!(tls.listen, "0.0.0.0:6189");
    }

    #[test]
    fn deserializes_tls_config_with_custom_listen() {
        let json = serde_json::json!({
            "tls": {
                "cert": "/etc/ssl/cert.pem",
                "key": "/etc/ssl/key.pem",
                "listen": "0.0.0.0:8443"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tls = config.tls.unwrap();
        assert_eq!(tls.listen, "0.0.0.0:8443");
    }

    #[test]
    fn rejects_unknown_field_in_tls_config() {
        let json = serde_json::json!({
            "tls": {
                "cert": "/etc/ssl/cert.pem",
                "key": "/etc/ssl/key.pem",
                "unknown": true
            }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for unknown field in tls");
    }

    #[test]
    fn rejects_tls_config_missing_cert() {
        let json = serde_json::json!({
            "tls": { "key": "/etc/ssl/key.pem" }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for missing cert");
    }

    #[test]
    fn rejects_tls_config_missing_key() {
        let json = serde_json::json!({
            "tls": { "cert": "/etc/ssl/cert.pem" }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err(), "expected error for missing key");
    }

    #[test]
    fn deserializes_ca() {
        let json = serde_json::json!({ "ca": "/etc/ssl/ca.pem" });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.ca.unwrap(), "/etc/ssl/ca.pem");
    }

    #[test]
    fn default_trait_includes_tls_none_and_ca_none() {
        let config = ServerConfig::default();
        assert!(config.tls.is_none());
        assert!(config.ca.is_none());
    }

    #[test]
    fn tracing_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.tracing.is_none());
    }

    #[test]
    fn deserializes_tracing_config() {
        let json = serde_json::json!({
            "tracing": {
                "enabled": true,
                "endpoint": "http://localhost:4317",
                "sample-rate": 0.5,
                "service-name": "my-gateway"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tracing = config.tracing.unwrap();
        assert!(tracing.enabled);
        assert_eq!(tracing.endpoint, "http://localhost:4317");
        assert!((tracing.sample_rate - 0.5).abs() < f64::EPSILON);
        assert_eq!(tracing.service_name, "my-gateway");
    }

    #[test]
    fn tracing_config_uses_defaults() {
        let json = serde_json::json!({
            "tracing": {
                "endpoint": "http://localhost:4317"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let tracing = config.tracing.unwrap();
        assert!(!tracing.enabled);
        assert!((tracing.sample_rate - 1.0).abs() < f64::EPSILON);
        assert_eq!(tracing.service_name, "plenum");
    }

    #[test]
    fn tracing_config_rejects_unknown_field() {
        let json = serde_json::json!({
            "tracing": {
                "endpoint": "http://localhost:4317",
                "unknown": true
            }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err());
    }

    #[test]
    fn access_log_defaults_to_none() {
        let json = serde_json::json!({});
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        assert!(config.access_log.is_none());
    }

    #[test]
    fn deserializes_access_log_config() {
        let json = serde_json::json!({
            "access-log": {
                "format": "{\"method\": \"${{ method }}\"}"
            }
        });
        let config: ServerConfig = serde_json::from_value(json).unwrap();
        let access_log = config.access_log.unwrap();
        assert_eq!(access_log.format, "{\"method\": \"${{ method }}\"}");
    }

    #[test]
    fn access_log_config_rejects_unknown_field() {
        let json = serde_json::json!({
            "access-log": {
                "format": "{}",
                "unknown": true
            }
        });
        let result: Result<ServerConfig, _> = serde_json::from_value(json);
        assert!(result.is_err());
    }
}
