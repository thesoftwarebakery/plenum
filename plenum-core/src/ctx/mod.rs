use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use crate::path_match::{HookHandle, RouteEntry};
use crate::rate_limit::RateLimitState;
use bytes::BytesMut;
use http::Method;
use tokio_util::sync::CancellationToken;

pub struct GatewayCtx {
    pub(crate) matched_route: Option<Arc<RouteEntry>>,
    pub(crate) matched_method: Option<Method>,
    pub(crate) request_body_buf: BytesMut,
    /// Set when `request_body_filter` has already written an inline response (e.g. a
    /// `respond` action from an `on_request` interceptor). Signals `upstream_peer` to
    /// abort the upstream connection so the pipeline stops cleanly.
    pub(crate) filter_responded: bool,
    pub(crate) response_body_buf: BytesMut,
    pub(crate) upstream_response_status: Option<http::StatusCode>,
    pub(crate) upstream_response_content_type: Option<String>,
    pub(crate) path_params: HashMap<String, serde_json::Value>,
    /// Timestamp when the request started processing (set after route matching).
    /// Used to compute remaining time budget for overall request timeout.
    pub(crate) request_start: Option<Instant>,
    /// Generic cancellation signal for this request. Triggered by the overall request
    /// timeout, but can also be used for other cancellation scenarios (client disconnect,
    /// rate limiting, circuit breakers, etc.).
    pub(crate) cancellation: CancellationToken,
    /// Running tally of inbound request body bytes received across all chunks.
    /// Incremented in request_body_filter on each chunk; checked against the per-operation limit.
    pub(crate) request_body_bytes_received: usize,
    /// User-land context bag. Carried across the full request lifecycle and passed into
    /// every interceptor and plugin call. Interceptors and plugins can read and write
    /// arbitrary keys; the gateway populates reserved keys under `ctx.gateway.*`.
    pub(crate) user_ctx: serde_json::Map<String, serde_json::Value>,
    /// The socket address of the selected backend peer (for multi-upstream routes).
    /// Set during upstream_peer resolution, read during fail_to_proxy to report
    /// the failure back to the load balancer pool.
    pub(crate) selected_backend_addr: Option<SocketAddr>,
    /// Global `on_gateway_error` interceptor hook, cloned from `Plenum` at request start.
    pub(crate) error_hook: Option<Arc<HookHandle>>,
    /// Rate limit evaluation result for this request, populated after on_request
    /// interceptors run. `None` when no `x-plenum-rate-limit` is configured on
    /// the matched operation. Serialized as `rateLimits` on interceptor input objects.
    pub(crate) rate_limit_state: Option<RateLimitState>,
    /// Top-level `http.request` tracing span for this request. Created in
    /// `request_filter` and entered (via `.enter()`) in every subsequent
    /// `ProxyHttp` method so that child spans (route_match, interceptor_call)
    /// nest correctly. Also used directly by `before_upstream` to extract the
    /// OTel context for `traceparent` injection into upstream requests.
    pub(crate) request_span: Option<tracing::Span>,
    /// OpenTelemetry context extracted from incoming `traceparent` /
    /// `tracestate` request headers. Set as the parent of `request_span` so
    /// the gateway joins the caller's distributed trace. Also used by the
    /// access log to resolve the `${{ trace_id }}` token.
    #[cfg(feature = "otel")]
    pub(crate) otel_context: Option<opentelemetry::Context>,
}
