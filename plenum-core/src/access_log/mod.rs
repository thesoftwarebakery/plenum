//! Access log — emits one structured log line per completed request.
//!
//! The format is a user-defined template using Plenum's standard `${{ }}`
//! interpolation syntax. Templates are parsed once at boot time and resolved
//! per-request with minimal allocation.
//!
//! ## Token types
//!
//! **Request tokens** are resolved from the incoming request via the existing
//! [`ContextRef`] system: `method`, `path`, `client-ip`, `header.*`,
//! `query.*`, `path-param.*`, `cookie.*`, `ctx.*`.
//!
//! **Response tokens** are resolved from [`GatewayCtx`] fields after the
//! request completes: `status`, `latency_ms`, `route`, `trace_id`, `upstream`.
//!
//! ## JSON safety
//!
//! String token values are JSON-escaped before interpolation (double quotes,
//! backslashes, newlines, and control characters are escaped). This ensures
//! that JSON-formatted templates remain valid even when values contain special
//! characters. Numeric tokens (`status`, `latency_ms`) are interpolated as
//! raw numbers without escaping, so they can be used outside quotes in JSON:
//!
//! ```text
//! {"status": ${{ status }}, "path": "${{ path }}"}
//!            ^^^^^^^^^^^^^^          ^^^^^^^^^^^^^^
//!            raw number              JSON-escaped string
//! ```
//!
//! ## Log output
//!
//! Access log lines are written directly to **stdout**, bypassing the
//! tracing-subscriber system log pipeline entirely. This keeps access logs
//! independent of the `log-level` setting — they are either on (when
//! `access-log.enabled` is `true`) or off. System logs (boot messages,
//! errors, warnings) go to **stderr** via tracing-subscriber.
//!
//! ## Default format
//!
//! When no custom `format` is specified, a built-in default is used.
//! The default conditionally includes `trace_id` when tracing is enabled.
//!
//! See [`AccessLogConfig`](crate::config::AccessLogConfig) for the full list
//! of available tokens and configuration examples.

use std::io::Write;
use std::sync::Arc;

use crate::ctx::GatewayCtx;
use crate::request_context::{ExtractionCtx, PingoraRequest};
use plenum_config::{ContextRef, Template, TemplatePart, Token};

/// Built-in default access log format (without trace_id).
const DEFAULT_FORMAT: &str = r#"{"method":"${{ method }}","path":"${{ path }}","status":${{ status }},"latency_ms":${{ latency_ms }},"client_ip":"${{ client-ip }}","route":"${{ route }}"}"#;

/// Built-in default access log format (with trace_id, used when tracing is enabled).
const DEFAULT_FORMAT_WITH_TRACING: &str = r#"{"method":"${{ method }}","path":"${{ path }}","status":${{ status }},"latency_ms":${{ latency_ms }},"client_ip":"${{ client-ip }}","route":"${{ route }}","trace_id":"${{ trace_id }}"}"#;

/// Return the appropriate default format string based on whether tracing is enabled.
pub fn default_format(tracing_enabled: bool) -> &'static str {
    if tracing_enabled {
        DEFAULT_FORMAT_WITH_TRACING
    } else {
        DEFAULT_FORMAT
    }
}

/// A segment of the access log template, pre-parsed at boot time.
#[derive(Debug)]
enum Part {
    Literal(String),
    /// A request-side token resolved via the standard ContextRef.
    RequestToken(ContextRef),
    /// Response status code (numeric — no JSON escaping).
    Status,
    /// Request latency in milliseconds (numeric — no JSON escaping).
    LatencyMs,
    /// Matched route pattern (string — JSON escaped).
    Route,
    /// OTel trace ID (string — JSON escaped). Empty when tracing is off.
    TraceId,
    /// Selected upstream backend address (string — JSON escaped).
    Upstream,
}

/// A pre-parsed access log format template.
///
/// Built once at boot time from the `access-log.format` config string.
/// On each completed request, [`emit`](Self::emit) resolves all tokens
/// against the request/response data and writes a single log line.
///
/// The template is stored on [`Plenum`](crate::Plenum) behind an `Arc`
/// so it can be shared across worker threads without cloning.
#[derive(Debug)]
pub struct AccessLogTemplate {
    parts: Vec<Part>,
}

impl AccessLogTemplate {
    /// Parse a format string into an [`AccessLogTemplate`].
    ///
    /// Tokens are validated against both the request-context namespace and
    /// the response-side access log tokens. Returns an error on unknown
    /// namespaces or malformed syntax.
    pub fn parse(format: &str) -> Result<Self, String> {
        let template = Template::parse(format)?;
        let mut parts = Vec::new();

        for tp in template.parts() {
            match tp {
                TemplatePart::Literal(s) => parts.push(Part::Literal(s.clone())),
                TemplatePart::Expr(token) => {
                    parts.push(Self::classify_token(token)?);
                }
            }
        }

        Ok(Self { parts })
    }

    fn classify_token(token: &Token) -> Result<Part, String> {
        // Check response-side tokens first (no key expected).
        if token.key.is_empty() {
            match token.namespace.as_str() {
                "status" => return Ok(Part::Status),
                "latency_ms" => return Ok(Part::LatencyMs),
                "route" => return Ok(Part::Route),
                "trace_id" => return Ok(Part::TraceId),
                "upstream" => return Ok(Part::Upstream),
                _ => {}
            }
        }

        // Fall through to request-side tokens.
        match ContextRef::from_token(token) {
            Ok(cr) => Ok(Part::RequestToken(cr)),
            Err(e) => Err(e),
        }
    }

    /// Resolve the template against a completed request and emit a log line.
    ///
    /// `req_header` is the original downstream request header (needed to resolve
    /// request-side tokens like `header.*`, `method`, `path`, etc.).
    pub fn emit(&self, session: &pingora_proxy::Session, ctx: &GatewayCtx) {
        let req_header = session.req_header();
        let extraction_ctx = ExtractionCtx {
            req: PingoraRequest(req_header),
            path_params: &ctx.path_params,
            user_ctx: Some(&ctx.user_ctx),
            peer_addr: session
                .client_addr()
                .and_then(|a| a.as_inet())
                .map(|a| a.ip()),
            query_params: None,
            body_json: None,
        };

        let mut output = String::new();
        for part in &self.parts {
            match part {
                Part::Literal(s) => output.push_str(s),
                Part::RequestToken(cr) => {
                    let val = cr.extract(&extraction_ctx).unwrap_or_default();
                    json_escape_into(&val, &mut output);
                }
                Part::Status => {
                    let code = ctx
                        .upstream_response_status
                        .map(|s| s.as_u16())
                        .unwrap_or(0);
                    output.push_str(&code.to_string());
                }
                Part::LatencyMs => {
                    let ms = ctx
                        .request_start
                        .map(|s| s.elapsed().as_millis())
                        .unwrap_or(0);
                    output.push_str(&ms.to_string());
                }
                Part::Route => {
                    let route = ctx
                        .matched_route
                        .as_ref()
                        .map(|r| r.path.as_str())
                        .unwrap_or("");
                    json_escape_into(route, &mut output);
                }
                Part::TraceId => {
                    let trace_id = resolve_trace_id(ctx);
                    json_escape_into(&trace_id, &mut output);
                }
                Part::Upstream => {
                    let addr = ctx
                        .selected_backend_addr
                        .map(|a| a.to_string())
                        .unwrap_or_default();
                    json_escape_into(&addr, &mut output);
                }
            }
        }

        // Write directly to stdout — access logs bypass the tracing-subscriber
        // pipeline so they are independent of the system log level.
        let stdout = std::io::stdout();
        let mut handle = stdout.lock();
        let _ = writeln!(handle, "{}", output);
    }
}

/// Resolve the OTel trace ID from the current span, or return empty string.
#[cfg(feature = "otel")]
fn resolve_trace_id(ctx: &GatewayCtx) -> String {
    use opentelemetry::trace::TraceContextExt;
    if let Some(ref otel_cx) = ctx.otel_context {
        let span_ref = otel_cx.span();
        let trace_id = span_ref.span_context().trace_id();
        if trace_id != opentelemetry::trace::TraceId::INVALID {
            return trace_id.to_string();
        }
    }
    String::new()
}

#[cfg(not(feature = "otel"))]
fn resolve_trace_id(_ctx: &GatewayCtx) -> String {
    String::new()
}

/// Append `s` to `output` with JSON string escaping (double quotes, backslashes,
/// and control characters).
fn json_escape_into(s: &str, output: &mut String) {
    for ch in s.chars() {
        match ch {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            c if c.is_control() => {
                output.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => output.push(c),
        }
    }
}

/// Shared, reference-counted access log template. `None` when no access log
/// is configured. Stored on [`Plenum`] and cloned (cheaply) into each request
/// context that needs it.
pub type SharedAccessLog = Option<Arc<AccessLogTemplate>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_escape_plain_string() {
        let mut out = String::new();
        json_escape_into("hello world", &mut out);
        assert_eq!(out, "hello world");
    }

    #[test]
    fn json_escape_double_quotes() {
        let mut out = String::new();
        json_escape_into(r#"say "hello""#, &mut out);
        assert_eq!(out, r#"say \"hello\""#);
    }

    #[test]
    fn json_escape_backslash() {
        let mut out = String::new();
        json_escape_into(r"path\to\file", &mut out);
        assert_eq!(out, r"path\\to\\file");
    }

    #[test]
    fn json_escape_newline_tab() {
        let mut out = String::new();
        json_escape_into("line1\nline2\ttab", &mut out);
        assert_eq!(out, "line1\\nline2\\ttab");
    }

    #[test]
    fn json_escape_control_char() {
        let mut out = String::new();
        json_escape_into("null\x00byte", &mut out);
        assert_eq!(out, "null\\u0000byte");
    }

    #[test]
    fn parse_simple_template() {
        let t = AccessLogTemplate::parse(r#"{"status": ${{ status }}, "method": "${{ method }}"}"#)
            .unwrap();
        assert_eq!(t.parts.len(), 5); // literal, status, literal, method, literal
    }

    #[test]
    fn parse_all_response_tokens() {
        let t = AccessLogTemplate::parse(
            "${{ status }} ${{ latency_ms }} ${{ route }} ${{ trace_id }} ${{ upstream }}",
        )
        .unwrap();
        let response_parts: Vec<_> = t
            .parts
            .iter()
            .filter(|p| !matches!(p, Part::Literal(_)))
            .collect();
        assert_eq!(response_parts.len(), 5);
    }

    #[test]
    fn parse_request_tokens() {
        let t = AccessLogTemplate::parse(
            "${{ method }} ${{ path }} ${{ header.x-request-id }} ${{ client-ip }}",
        )
        .unwrap();
        let request_parts: Vec<_> = t
            .parts
            .iter()
            .filter(|p| matches!(p, Part::RequestToken(_)))
            .collect();
        assert_eq!(request_parts.len(), 4);
    }

    #[test]
    fn parse_rejects_unknown_namespace() {
        let result = AccessLogTemplate::parse("${{ unknown_thing }}");
        assert!(result.is_err());
    }

    #[test]
    fn json_output_stays_valid_with_quotes_in_value() {
        // Simulate what happens when a path contains quotes
        let mut json = String::from(r#"{"path": ""#);
        json_escape_into(r#"/api/say "hello""#, &mut json);
        json.push_str(r#""}"#);
        // Should be valid JSON
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&json);
        assert!(parsed.is_ok());
        assert_eq!(
            parsed.unwrap()["path"].as_str().unwrap(),
            r#"/api/say "hello""#
        );
    }
}
