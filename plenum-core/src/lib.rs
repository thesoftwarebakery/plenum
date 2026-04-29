use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use config::Config;
use gateway_error::GatewayErrorResponse;
use path_match::{HookHandle, OperationSchemas, Upstream, build_router};
use pingora_core::upstreams::peer::HttpPeer;
use pingora_http::ResponseHeader;
use pingora_limits::rate::Rate;
use pingora_proxy::{FailToProxy, ProxyHttp, Session};
use tokio_util::sync::CancellationToken;

pub mod config;
mod cors;
mod ctx;
pub mod gateway_error;
mod headers;
pub mod health_check;
pub mod interceptor;
pub mod load_balancing;
mod openapi;
pub mod path_match;
mod phases;
mod proxy_utils;
pub mod rate_limit;
pub mod request_context;
pub mod request_timeout;
mod runtime_builder;
pub mod upstream_peer;
pub mod upstream_plugin;

pub use ctx::GatewayCtx;

pub struct Plenum {
    router: path_match::PlenumRouter,
    /// Global `on_gateway_error` interceptor hook, shared across all requests.
    error_hook: Option<Arc<HookHandle>>,
    /// Per-window-duration rate limiters, keyed by window in seconds.
    /// Populated at boot time from all `x-plenum-rate-limit` configs found across
    /// all routes. One `Rate` per distinct window duration.
    rate_limiters: HashMap<u64, pingora_limits::rate::Rate>,
}

/// Compute effective interceptor timeout from remaining request budget.
/// Cancels the request if budget is exhausted. Falls back to the per-interceptor
/// timeout when no overall request timeout is active.
pub(crate) fn effective_timeout(
    ctx: &GatewayCtx,
    op: &OperationSchemas,
    hook: &HookHandle,
) -> Duration {
    let Some(start) = ctx.request_start else {
        return hook.timeout;
    };
    match request_timeout::effective_interceptor_timeout(start, op.request_timeout, hook.timeout) {
        Some(t) => t,
        None => {
            ctx.cancellation.cancel();
            Duration::ZERO
        }
    }
}

#[async_trait]
impl ProxyHttp for Plenum {
    type CTX = GatewayCtx;

    fn new_ctx(&self) -> Self::CTX {
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
            user_ctx: serde_json::Map::new(),
            selected_backend_addr: None,
            error_hook: self.error_hook.clone(),
            rate_limit_state: None,
        }
    }

    async fn request_filter(
        &self,
        session: &mut Session,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<bool>
    where
        Self::CTX: Send + Sync,
    {
        let path = session.req_header().uri.path().to_string();
        let route_result = {
            let _span = tracing::debug_span!("route_match", path = path.as_str()).entered();
            self.router.at(&path).ok()
        };
        let Some(matched) = route_result else {
            log::warn!("No route matched for path: {}", path);
            phases::gateway_error::respond(
                session,
                ctx,
                GatewayErrorResponse::not_found("no matching route"),
                ctx.error_hook.clone().as_deref(),
            )
            .await;
            return Ok(true);
        };
        let route_arc = matched.value.clone();
        let method = session.req_header().method.clone();
        ctx.matched_route = Some(route_arc.clone());
        ctx.matched_method = Some(method.clone());
        ctx.path_params = matched
            .params
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        // CORS preflight: OPTIONS requests won't have a matching operation in the
        // OpenAPI spec, so check before the method-based lookup. Find the first
        // CORS config from any operation on the matched path.
        if method == http::Method::OPTIONS
            && let Some(cors_config) = route_arc
                .operations
                .values()
                .find_map(|op| op.cors.as_ref())
            && let cors::PreflightResult::Handled =
                cors::handle_preflight(session, cors_config).await?
        {
            return Ok(true);
        }

        let Some(op) = route_arc.get_operation(&method) else {
            // OPTIONS without a matching operation is proxied upstream (non-CORS OPTIONS,
            // or CORS without Origin header). All other methods get 405.
            if method == http::Method::OPTIONS {
                return Ok(false);
            }
            // Path matched but method not allowed — respond with 405 and Allow header.
            let mut allowed: Vec<&str> = route_arc.operations.keys().map(|m| m.as_str()).collect();
            // HEAD is implicitly allowed whenever GET is defined.
            if route_arc.operations.contains_key(&http::Method::GET)
                && !route_arc.operations.contains_key(&http::Method::HEAD)
            {
                allowed.push("HEAD");
            }
            allowed.sort();
            let allow_value = allowed.join(", ");
            log::warn!(
                "Method {} not allowed for path: {} (allowed: {})",
                method,
                path,
                allow_value
            );
            proxy_utils::write_response(
                session,
                405,
                &[
                    ("Allow".to_string(), allow_value),
                    ("Content-Type".to_string(), "application/json".to_string()),
                ],
                Bytes::from(serde_json::json!({"error": "method not allowed"}).to_string()),
            )
            .await
            .ok();
            return Ok(true);
        };

        ctx.request_start = Some(Instant::now());

        // Plugin routes: wrap on_request_headers + on_request phase 1 + dispatch in a single timeout.
        if let Upstream::Plugin(plugin) = &route_arc.upstream {
            let backend_config = op.backend_config.clone();
            return match pingora_timeout::timeout(op.request_timeout, async {
                if phases::on_request_headers::run(session, ctx, op, false).await? {
                    return Ok(true);
                }
                // Rate limit evaluation: runs after on_request_headers (which populates
                // auth identity in ctx), before on_request (which can read rateLimits).
                if let Some(ref rl) = op.rate_limit
                    && rate_limit::evaluate(session, ctx, rl, &self.rate_limiters)
                {
                    phases::gateway_error::respond(
                        session,
                        ctx,
                        GatewayErrorResponse::too_many_requests("rate limit exceeded"),
                        ctx.error_hook.clone().as_deref(),
                    )
                    .await;
                    return Ok(true);
                }
                if phases::on_request::run_phase1(session, ctx, op, false).await? {
                    return Ok(true);
                }
                upstream_plugin::dispatch(session, ctx, op, plugin, backend_config).await
            })
            .await
            {
                Ok(inner) => inner,
                Err(_elapsed) => {
                    ctx.cancellation.cancel();
                    log::warn!("request timeout exceeded for plugin route");
                    phases::gateway_error::respond(
                        session,
                        ctx,
                        GatewayErrorResponse::gateway_timeout("request timeout exceeded"),
                        ctx.error_hook.clone().as_deref(),
                    )
                    .await;
                    Ok(true)
                }
            };
        }

        // HTTP/Static routes: budget-capped on_request_headers, then rate limit, then on_request.
        if phases::on_request_headers::run(session, ctx, op, true).await? {
            return Ok(true);
        }

        // Rate limit evaluation: runs after on_request_headers (which populates
        // auth identity in ctx), before on_request (which can read rateLimits).
        // Not applied to static routes.
        if !matches!(route_arc.upstream, Upstream::Static(_))
            && let Some(ref rl) = op.rate_limit
            && rate_limit::evaluate(session, ctx, rl, &self.rate_limiters)
        {
            phases::gateway_error::respond(
                session,
                ctx,
                GatewayErrorResponse::too_many_requests("rate limit exceeded"),
                ctx.error_hook.clone().as_deref(),
            )
            .await;
            return Ok(true);
        }

        if phases::on_request::run_phase1(session, ctx, op, true).await? {
            return Ok(true);
        }

        // Static routes: write the pre-built response and short-circuit.
        if let Upstream::Static(static_resp) = &route_arc.upstream {
            let mut resp_header = pingora_http::ResponseHeader::build(static_resp.status, None)
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "build static response header",
                        e,
                    )
                })?;
            for (name, value) in &static_resp.headers {
                resp_header
                    .insert_header(name.clone(), value.as_bytes())
                    .ok();
            }
            session
                .write_response_header(Box::new(resp_header), false)
                .await
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "write static response header",
                        e,
                    )
                })?;
            // HEAD responses must not include a body (RFC 9110).
            let body = if method == http::Method::HEAD {
                Bytes::new()
            } else {
                static_resp.body.clone()
            };
            session
                .write_response_body(Some(body), true)
                .await
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "write static response body",
                        e,
                    )
                })?;
            return Ok(true);
        }

        Ok(false)
    }

    async fn request_body_filter(
        &self,
        session: &mut Session,
        body: &mut Option<Bytes>,
        end_of_stream: bool,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<()>
    where
        Self::CTX: Send + Sync,
    {
        // Clone the Arc so `op` doesn't borrow from `ctx`, allowing ctx to be
        // passed mutably to the phase handler.
        let Some(route_arc) = ctx.matched_route.clone() else {
            return Ok(());
        };
        let Some(method) = ctx.matched_method.clone() else {
            return Ok(());
        };
        let Some(op) = route_arc.get_operation(&method) else {
            return Ok(());
        };
        phases::on_request::run_body_filter(session, body, end_of_stream, ctx, op).await?;
        Ok(())
    }

    async fn upstream_request_filter(
        &self,
        _session: &mut Session,
        upstream_request: &mut pingora_http::RequestHeader,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<()>
    where
        Self::CTX: Send + Sync,
    {
        // Clone the Arc so `op` doesn't borrow from `ctx`, allowing ctx to be
        // passed mutably to the phase handler.
        let Some(route_arc) = ctx.matched_route.clone() else {
            return Ok(());
        };
        let Some(method) = ctx.matched_method.clone() else {
            return Ok(());
        };
        let Some(op) = route_arc.get_operation(&method) else {
            return Ok(());
        };
        phases::before_upstream::run(upstream_request, ctx, op).await
    }

    async fn response_filter(
        &self,
        _session: &mut Session,
        upstream_response: &mut ResponseHeader,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<()>
    where
        Self::CTX: Send + Sync,
    {
        // Clone the Arc so `op` doesn't borrow from `ctx`, allowing ctx to be
        // passed mutably to the phase handler.
        let Some(route_arc) = ctx.matched_route.clone() else {
            return Ok(());
        };
        let Some(method) = ctx.matched_method.clone() else {
            return Ok(());
        };
        let Some(op) = route_arc.get_operation(&method) else {
            return Ok(());
        };

        phases::on_response::run(upstream_response, ctx, op).await?;

        // Add CORS headers for actual (non-preflight) responses.
        if let Some(ref cors_config) = op.cors {
            cors::add_cors_headers_to_response(upstream_response, cors_config, _session);
        }

        // When on_response_body is configured, strip Content-Length (body size may change)
        // and store metadata in ctx for use in upstream_response_body_filter.
        if !op.interceptors.on_response_body.is_empty() {
            upstream_response.remove_header(&http::header::CONTENT_LENGTH);
            ctx.upstream_response_status = Some(upstream_response.status);
            ctx.upstream_response_content_type = upstream_response
                .headers
                .get(http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
        }

        Ok(())
    }

    fn upstream_response_body_filter(
        &self,
        _session: &mut Session,
        body: &mut Option<Bytes>,
        end_of_stream: bool,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Option<Duration>>
    where
        Self::CTX: Send + Sync,
    {
        // Clone the Arc so `op` doesn't borrow from `ctx`, allowing ctx to be
        // passed mutably to the phase handler.
        let Some(route_arc) = ctx.matched_route.clone() else {
            return Ok(None);
        };
        let Some(method) = ctx.matched_method.clone() else {
            return Ok(None);
        };
        let Some(op) = route_arc.get_operation(&method) else {
            return Ok(None);
        };

        if op.interceptors.on_response_body.is_empty() {
            return Ok(None);
        }

        // HEAD responses must not have a body (RFC 9110). Skip body transforms
        // when HEAD fell back to GET's operation config.
        if method == http::Method::HEAD && !route_arc.operations.contains_key(&http::Method::HEAD) {
            return Ok(None);
        }

        // Buffer chunks until end_of_stream
        if let Some(b) = body {
            ctx.response_body_buf.put(b.as_ref());
            b.clear();
        }

        if end_of_stream {
            let buf = ctx.response_body_buf.split().freeze();
            let status = ctx.upstream_response_status.unwrap_or(http::StatusCode::OK);

            let final_buf =
                tokio::task::block_in_place(|| phases::on_response::run_body(ctx, op, buf, status));

            *body = Some(final_buf);
        }

        Ok(None)
    }

    async fn upstream_peer(
        &self,
        session: &mut Session,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Box<HttpPeer>> {
        phases::upstream_peer::resolve(ctx, session)
    }

    async fn fail_to_proxy(
        &self,
        session: &mut Session,
        e: &pingora_core::Error,
        ctx: &mut Self::CTX,
    ) -> FailToProxy
    where
        Self::CTX: Send + Sync,
    {
        // Report failure to load balancer pool for passive health tracking.
        if let (Some(addr), Some(route)) = (&ctx.selected_backend_addr, &ctx.matched_route)
            && let Upstream::HttpPool(pool) = &route.upstream
        {
            pool.report_failure(addr);
        }

        if ctx.request_start.is_some() && request_timeout::is_timeout_error(e) {
            phases::gateway_error::respond(
                session,
                ctx,
                GatewayErrorResponse::gateway_timeout("request timeout exceeded"),
                ctx.error_hook.clone().as_deref(),
            )
            .await;
            return FailToProxy {
                error_code: 504,
                can_reuse_downstream: false,
            };
        }

        phases::gateway_error::respond(
            session,
            ctx,
            GatewayErrorResponse::bad_gateway("upstream connection failed"),
            ctx.error_hook.clone().as_deref(),
        )
        .await;
        FailToProxy {
            error_code: 502,
            can_reuse_downstream: false,
        }
    }
}

/// Result of building the gateway, including background services.
pub struct GatewayBuildResult {
    pub gateway: Plenum,
    pub background_services: Vec<load_balancing::builder::BackgroundHealthService>,
}

pub fn build_gateway(
    config: &Config,
    config_path: &str,
) -> Result<GatewayBuildResult, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);
    let result = build_router(config, paths, std::path::Path::new(config_path))?;
    let rate_limiters: HashMap<u64, Rate> = result
        .rate_limit_windows
        .iter()
        .map(|&secs| (secs, Rate::new(std::time::Duration::from_secs(secs))))
        .collect();
    Ok(GatewayBuildResult {
        gateway: Plenum {
            router: result.router,
            error_hook: result.error_hook.map(Arc::new),
            rate_limiters,
        },
        background_services: result.background_services,
    })
}
