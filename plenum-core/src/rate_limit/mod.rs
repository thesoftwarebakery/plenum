use std::collections::HashMap;

use pingora_limits::rate::Rate;
use pingora_proxy::Session;
use serde::Serialize;
use ts_rs::TS;

use crate::config::RateLimitConfig;
use crate::ctx::GatewayCtx;

/// Gateway-populated rate limit state for the current request.
/// Serialized as `rateLimits` on interceptor/plugin input objects — read-only
/// from the user-land perspective (interceptors cannot return modifications to it).
#[derive(Debug, Clone, Serialize, TS)]
pub struct RateLimitState {
    /// The resolved identifier string used as the rate limit key.
    pub identifier: String,
    /// Current event count in the active window.
    pub count: isize,
    /// Maximum events allowed per window.
    pub limit: u64,
    /// Window length in seconds.
    #[serde(rename = "windowSeconds")]
    #[ts(rename = "windowSeconds")]
    pub window_seconds: u64,
    /// Whether the request is over the limit.
    pub over: bool,
    /// Seconds until the current window resets. `null` when not over limit.
    #[serde(rename = "retryAfter")]
    #[ts(rename = "retryAfter")]
    pub retry_after: Option<u64>,
}

/// Evaluate rate limiting for the current request.
///
/// Resolves the identifier template, records the event cost, and populates
/// `ctx.rate_limit_state`. Returns `true` when the request is over the limit
/// AND `config.enforce` is `true` — the caller should respond with 429.
///
/// Returns `false` in all other cases (under limit, or enforce disabled, or
/// identifier could not be resolved).
pub(crate) fn evaluate(
    session: &Session,
    ctx: &mut GatewayCtx,
    config: &RateLimitConfig,
    rate_limiters: &HashMap<u64, Rate>,
) -> bool {
    let Some(identifier) = resolve_identifier(session, ctx, &config.identifier) else {
        log::debug!(
            "rate_limit: identifier template could not be resolved, skipping: {}",
            config.identifier
        );
        return false;
    };

    let window =
        crate::config::parse_window_duration(&config.window).expect("validated at boot time");
    let window_secs = window.as_secs();

    let cost = extract_cost(ctx, config.cost_ctx_path.as_deref());

    let Some(rate) = rate_limiters.get(&window_secs) else {
        log::error!(
            "rate_limit: no Rate instance found for window {}s",
            window_secs
        );
        return false;
    };

    let count = rate.observe(&identifier, cost as isize);
    let over = count > config.limit as isize;

    ctx.rate_limit_state = Some(RateLimitState {
        identifier,
        count,
        limit: config.limit,
        window_seconds: window_secs,
        over,
        retry_after: if over { Some(window_secs) } else { None },
    });

    over && config.enforce
}

/// Resolve a template string containing `${{ namespace.key }}` expressions.
///
/// Returns `None` if any expression fails to resolve (identifier cannot be
/// formed — rate limiting is skipped for this request).
fn resolve_identifier(session: &Session, ctx: &GatewayCtx, template: &str) -> Option<String> {
    let mut result = String::with_capacity(template.len());
    let mut rest = template;

    loop {
        match rest.find("${{") {
            None => {
                result.push_str(rest);
                break;
            }
            Some(start) => {
                result.push_str(&rest[..start]);
                rest = &rest[start + 3..]; // skip "${{"

                let end = rest.find("}}")?;
                let expr = rest[..end].trim();
                rest = &rest[end + 2..]; // skip "}}"

                let resolved = resolve_expression(session, ctx, expr)?;
                result.push_str(&resolved);
            }
        }
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

/// Resolve a single `namespace.key` or bare `namespace` expression.
fn resolve_expression(session: &Session, ctx: &GatewayCtx, expr: &str) -> Option<String> {
    // `ip` has no sub-key
    if expr == "ip" {
        return session
            .client_addr()
            .and_then(|addr| addr.as_inet())
            .map(|addr| addr.ip().to_string());
    }

    let (namespace, key) = expr.split_once('.')?;

    match namespace {
        "header" => {
            let headers = &session.req_header().headers;
            headers
                .get(key)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        }
        "query" => {
            let query = session.req_header().uri.query().unwrap_or("");
            form_urlencoded::parse(query.as_bytes())
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        }
        "cookie" => {
            let headers = &session.req_header().headers;
            let cookie_header = headers.get(http::header::COOKIE)?.to_str().ok()?;
            cookie_header.split(';').map(str::trim).find_map(|pair| {
                let (name, value) = pair.split_once('=')?;
                if name.trim() == key {
                    Some(value.trim().to_string())
                } else {
                    None
                }
            })
        }
        "ctx" => resolve_ctx_path(ctx, key).map(json_value_to_string),
        _ => {
            log::warn!("rate_limit: unknown identifier namespace '{namespace}' in template");
            None
        }
    }
}

/// Walk a dot-separated path in `user_ctx`, e.g. `"auth.userId"` → `ctx["auth"]["userId"]`.
pub(crate) fn resolve_ctx_path<'a>(
    ctx: &'a GatewayCtx,
    path: &str,
) -> Option<&'a serde_json::Value> {
    let mut segments = path.split('.');
    let first = segments.next()?;
    let mut current: Option<&serde_json::Value> = ctx.user_ctx.get(first);
    for segment in segments {
        current = current?.as_object()?.get(segment);
    }
    current
}

/// Convert a JSON value to a string for use as a rate limit identifier component.
fn json_value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

/// Extract the per-request event cost from user_ctx.
///
/// Walks `cost_ctx_path` (dot-separated) in `user_ctx`. Returns 1 if the path
/// is not set, doesn't resolve to a number, or is zero/negative.
fn extract_cost(ctx: &GatewayCtx, cost_ctx_path: Option<&str>) -> u64 {
    let Some(path) = cost_ctx_path else {
        return 1;
    };
    match resolve_ctx_path(ctx, path) {
        Some(v) => v.as_u64().filter(|&n| n > 0).unwrap_or(1),
        None => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_ctx(user_ctx: serde_json::Value) -> GatewayCtx {
        use bytes::BytesMut;
        use std::collections::HashMap;
        use tokio_util::sync::CancellationToken;
        GatewayCtx {
            matched_route: None,
            matched_method: None,
            request_body_buf: BytesMut::new(),
            filter_responded: false,
            response_body_buf: BytesMut::new(),
            upstream_response_status: None,
            upstream_response_content_type: None,
            path_params: HashMap::new(),
            request_start: None,
            cancellation: CancellationToken::new(),
            request_body_bytes_received: 0,
            user_ctx: user_ctx.as_object().cloned().unwrap_or_default(),
            selected_backend_addr: None,
            error_hook: None,
            rate_limit_state: None,
        }
    }

    // -- resolve_ctx_path --

    #[test]
    fn resolve_ctx_path_top_level() {
        let ctx = make_ctx(json!({ "userId": "abc123" }));
        let v = resolve_ctx_path(&ctx, "userId").unwrap();
        assert_eq!(v.as_str().unwrap(), "abc123");
    }

    #[test]
    fn resolve_ctx_path_nested() {
        let ctx = make_ctx(json!({ "auth": { "userId": "abc123" } }));
        let v = resolve_ctx_path(&ctx, "auth.userId").unwrap();
        assert_eq!(v.as_str().unwrap(), "abc123");
    }

    #[test]
    fn resolve_ctx_path_missing_returns_none() {
        let ctx = make_ctx(json!({}));
        assert!(resolve_ctx_path(&ctx, "userId").is_none());
    }

    #[test]
    fn resolve_ctx_path_partial_missing() {
        let ctx = make_ctx(json!({ "auth": {} }));
        assert!(resolve_ctx_path(&ctx, "auth.userId").is_none());
    }

    // -- extract_cost --

    #[test]
    fn extract_cost_defaults_to_one_when_no_path() {
        let ctx = make_ctx(json!({}));
        assert_eq!(extract_cost(&ctx, None), 1);
    }

    #[test]
    fn extract_cost_reads_from_ctx() {
        let ctx = make_ctx(json!({ "tokenCost": 5 }));
        assert_eq!(extract_cost(&ctx, Some("tokenCost")), 5);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_missing() {
        let ctx = make_ctx(json!({}));
        assert_eq!(extract_cost(&ctx, Some("tokenCost")), 1);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_zero() {
        let ctx = make_ctx(json!({ "tokenCost": 0 }));
        assert_eq!(extract_cost(&ctx, Some("tokenCost")), 1);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_non_numeric() {
        let ctx = make_ctx(json!({ "tokenCost": "five" }));
        assert_eq!(extract_cost(&ctx, Some("tokenCost")), 1);
    }

    // -- RateLimitState serialization --

    #[test]
    fn state_serializes_with_camel_case_fields() {
        let state = RateLimitState {
            identifier: "user-abc".into(),
            count: 5,
            limit: 10,
            window_seconds: 60,
            over: false,
            retry_after: None,
        };
        let v = serde_json::to_value(&state).unwrap();
        assert_eq!(v["identifier"], "user-abc");
        assert_eq!(v["count"], 5);
        assert_eq!(v["limit"], 10);
        assert_eq!(v["windowSeconds"], 60);
        assert_eq!(v["over"], false);
        assert!(v["retryAfter"].is_null());
    }

    #[test]
    fn state_serializes_retry_after_when_over() {
        let state = RateLimitState {
            identifier: "user-abc".into(),
            count: 11,
            limit: 10,
            window_seconds: 60,
            over: true,
            retry_after: Some(60),
        };
        let v = serde_json::to_value(&state).unwrap();
        assert_eq!(v["over"], true);
        assert_eq!(v["retryAfter"], 60);
    }
}
