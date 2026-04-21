use std::sync::Arc;

use http::Method;
use pingora_core::upstreams::peer::HttpPeer;

use crate::ctx::GatewayCtx;
use crate::path_match::{OperationSchemas, RouteEntry};
use crate::request_timeout;

/// Look up the matched operation from context, borrowing only the route and method fields.
/// Passing the fields explicitly (rather than `&GatewayCtx`) lets other fields remain
/// independently mutable while the returned reference is alive.
fn matched_op<'a>(
    matched_route: &'a Option<Arc<RouteEntry>>,
    matched_method: &Option<Method>,
) -> Option<&'a OperationSchemas> {
    let route = matched_route.as_ref()?;
    let method = matched_method.as_ref()?;
    route.operations.get(method)
}

/// Resolve the upstream peer for an HTTP route.
///
/// Checks for prior short-circuit responses and request cancellation, then
/// builds an `HttpPeer` with upstream timeouts set to the remaining request budget.
pub(crate) fn resolve(ctx: &GatewayCtx) -> pingora_core::Result<Box<HttpPeer>> {
    if ctx.filter_responded {
        return Err(pingora_core::Error::new(
            pingora_core::ErrorType::HTTPStatus(400),
        ));
    }
    if ctx.cancellation.is_cancelled() {
        return Err(pingora_core::Error::explain(
            pingora_core::ErrorType::ConnectTimedout,
            "request cancelled",
        ));
    }
    let route = ctx
        .matched_route
        .as_ref()
        .ok_or_else(|| pingora_core::Error::new(pingora_core::ErrorType::InternalError))?;
    match &route.upstream {
        crate::path_match::Upstream::Http(peer) => {
            let mut peer = Box::new(*peer.clone());

            // Set upstream timeouts to remaining request budget so pingora races
            // the upstream I/O against the overall request timeout.
            if let (Some(start), Some(op)) = (
                ctx.request_start,
                matched_op(&ctx.matched_route, &ctx.matched_method),
            ) {
                request_timeout::apply_to_peer(&mut peer, start, op.request_timeout)?;
            }

            Ok(peer)
        }
        crate::path_match::Upstream::Plugin(_) | crate::path_match::Upstream::Static(_) => {
            // Should never be reached -- plugin and static routes return Ok(true) from
            // request_filter, skipping upstream_peer entirely. This branch is a safety net.
            Err(pingora_core::Error::new(
                pingora_core::ErrorType::InternalError,
            ))
        }
    }
}
