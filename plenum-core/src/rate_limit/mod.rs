use std::collections::HashMap;

use pingora_limits::rate::Rate;
use pingora_proxy::Session;
use serde::Serialize;
use ts_rs::TS;

use crate::config::RateLimitConfig;
use crate::ctx::GatewayCtx;
use crate::request_context::ExtractionCtx;

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
/// Returns `false` in all other cases (under limit, enforce disabled, or
/// identifier could not be resolved — e.g. the header referenced in the
/// identifier template is absent).
pub(crate) fn evaluate(
    session: &Session,
    ctx: &mut GatewayCtx,
    config: &RateLimitConfig,
    rate_limiters: &HashMap<u64, Rate>,
) -> bool {
    let peer_addr = session
        .client_addr()
        .and_then(|a| a.as_inet())
        .map(|a| a.ip());

    let cx = ExtractionCtx {
        req: session.req_header(),
        path_params: &ctx.path_params,
        user_ctx: Some(&ctx.user_ctx),
        peer_addr,
    };

    let Some(identifier) = config.identifier.resolve(&cx) else {
        log::debug!(
            "rate_limit: identifier template could not be resolved, skipping: {}",
            config.identifier
        );
        return false;
    };

    let window =
        crate::config::parse_window_duration(&config.window).expect("validated at boot time");
    let window_secs = window.as_secs();

    let cost = extract_cost(&ctx.user_ctx, config.cost_ctx_path.as_deref());

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

/// Extract the per-request event cost from the user ctx bag.
///
/// Walks `cost_ctx_path` (dot-separated) in `user_ctx`. The resolved value
/// must be a positive JSON number; non-numeric, zero, or absent values
/// default to `1`.
fn extract_cost(
    user_ctx: &serde_json::Map<String, serde_json::Value>,
    cost_ctx_path: Option<&str>,
) -> u64 {
    let Some(path) = cost_ctx_path else {
        return 1;
    };
    // Walk the dot-path through the ctx map.
    let mut segments = path.split('.');
    let first = segments.next().unwrap_or("");
    let mut current: Option<&serde_json::Value> = user_ctx.get(first);
    for segment in segments {
        current = current
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(segment));
    }
    current
        .and_then(|v| v.as_u64())
        .filter(|&n| n > 0)
        .unwrap_or(1)
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

    // -- extract_cost --

    #[test]
    fn extract_cost_defaults_to_one_when_no_path() {
        let ctx = make_ctx(json!({}));
        assert_eq!(extract_cost(&ctx.user_ctx, None), 1);
    }

    #[test]
    fn extract_cost_reads_from_ctx() {
        let ctx = make_ctx(json!({ "tokenCost": 5 }));
        assert_eq!(extract_cost(&ctx.user_ctx, Some("tokenCost")), 5);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_missing() {
        let ctx = make_ctx(json!({}));
        assert_eq!(extract_cost(&ctx.user_ctx, Some("tokenCost")), 1);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_zero() {
        let ctx = make_ctx(json!({ "tokenCost": 0 }));
        assert_eq!(extract_cost(&ctx.user_ctx, Some("tokenCost")), 1);
    }

    #[test]
    fn extract_cost_defaults_to_one_when_non_numeric() {
        let ctx = make_ctx(json!({ "tokenCost": "five" }));
        assert_eq!(extract_cost(&ctx.user_ctx, Some("tokenCost")), 1);
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
