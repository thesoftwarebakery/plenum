use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use crate::path_match::RouteEntry;
use bytes::BytesMut;
use http::Method;

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
    pub(crate) path_params: HashMap<String, String>,
    /// Timestamp when the request started processing (set after route matching).
    /// Used to compute remaining time budget for overall request timeout.
    pub(crate) request_start: Option<Instant>,
}
