use std::sync::Arc;

use http::Method;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::Session;

use crate::ctx::GatewayCtx;
use crate::path_match::{OperationSchemas, RouteEntry};
use crate::request_timeout;
use crate::upstream::Upstream;

/// Look up the matched operation from context, borrowing only the route and method fields.
/// Passing the fields explicitly (rather than `&GatewayCtx`) lets other fields remain
/// independently mutable while the returned reference is alive.
fn matched_op<'a>(
    matched_route: &'a Option<Arc<RouteEntry>>,
    matched_method: &Option<Method>,
) -> Option<&'a OperationSchemas> {
    let route = matched_route.as_ref()?;
    let method = matched_method.as_ref()?;
    route.get_operation(method)
}

/// Resolve the upstream peer for an HTTP route.
///
/// Checks for prior short-circuit responses and request cancellation, then
/// builds an `HttpPeer` with upstream timeouts set to the remaining request budget.
///
/// For multi-upstream pool routes, selects a backend from the pool and stores
/// the selected address in `ctx.selected_backend_addr` for passive health reporting.
pub(crate) fn resolve(
    ctx: &mut GatewayCtx,
    session: &Session,
) -> pingora_core::Result<Box<HttpPeer>> {
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

    // Resolve the effective upstream: per-operation override > path-level.
    let op = matched_op(&ctx.matched_route, &ctx.matched_method);
    let effective_upstream = match op {
        Some(o) => route.effective_upstream(o),
        None => &route.upstream,
    };

    match effective_upstream {
        Upstream::Http(peer) => {
            let mut peer = Box::new(*peer.clone());

            // Set upstream timeouts to remaining request budget so pingora races
            // the upstream I/O against the overall request timeout.
            if let (Some(start), Some(op)) = (ctx.request_start, op) {
                request_timeout::apply_to_peer(&mut peer, start, op.request_timeout)?;
            }

            Ok(peer)
        }
        Upstream::HttpPool(pool) => {
            let req = session.req_header();
            let (mut peer, addr) = pool.select(req, &ctx.path_params).ok_or_else(|| {
                pingora_core::Error::explain(
                    pingora_core::ErrorType::ConnectRefused,
                    "no healthy upstream available",
                )
            })?;

            // Store the selected backend address for passive health reporting
            // in fail_to_proxy.
            ctx.selected_backend_addr = Some(addr);

            // Set upstream timeouts to remaining request budget.
            if let (Some(start), Some(op)) = (ctx.request_start, op) {
                request_timeout::apply_to_peer(&mut peer, start, op.request_timeout)?;
            }

            Ok(peer)
        }
        Upstream::Plugin(_) | Upstream::Static(_) | Upstream::NotConfigured => {
            // Should never be reached -- plugin, static, and not-configured routes return
            // Ok(true) from request_filter, skipping upstream_peer entirely. Safety net.
            Err(pingora_core::Error::new(
                pingora_core::ErrorType::InternalError,
            ))
        }
    }
}
