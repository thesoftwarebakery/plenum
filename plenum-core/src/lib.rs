use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use config::Config;
use gateway_error::GatewayError;
use http::Method;
use interceptor::{InterceptorOutput, request_input_from_parts, response_input_from_parts};
use path_match::{OperationSchemas, RouteEntry, Upstream, build_router};
use pingora_core::upstreams::peer::HttpPeer;
use pingora_http::{RequestHeader, ResponseHeader};
use pingora_proxy::{FailToProxy, ProxyHttp, Session};
use tracing::Instrument;

pub mod config;
mod ctx;
pub mod gateway_error;
mod headers;
pub mod interceptor;
mod openapi;
pub mod path_match;
mod proxy_utils;
pub mod request_timeout;
pub mod upstream_http;
mod upstream_plugin;

pub use ctx::GatewayCtx;
use headers::apply_header_modifications;
use proxy_utils::{
    call_interceptor, call_interceptor_blocking, js_body_from_content_type, js_body_to_bytes,
    merge_options,
};

pub struct Plenum {
    router: path_match::PlenumRouter,
}

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
        let path = session.req_header().uri.path();
        let matched = {
            let _span = tracing::debug_span!("route_match", path).entered();
            self.router.at(path).map_err(|e| {
                log::warn!("No route matched for path: {}", path);
                pingora_core::Error::because(
                    pingora_core::ErrorType::HTTPStatus(404),
                    "no matching route",
                    e,
                )
            })?
        };
        ctx.matched_route = Some(matched.value.clone());
        ctx.matched_method = Some(session.req_header().method.clone());
        ctx.path_params = matched
            .params
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        // Clone the Arc (cheap) so that `op` and `plugin` borrow from a local variable rather
        // than from ctx. This lets us later pass ctx mutably to upstream_plugin::dispatch while
        // op and plugin are still in scope.
        let Some(route_arc) = ctx.matched_route.clone() else {
            return Ok(false);
        };
        let Some(method) = ctx.matched_method.clone() else {
            return Ok(false);
        };
        let Some(op) = route_arc.operations.get(&method) else {
            return Ok(false);
        };

        ctx.request_start = Some(Instant::now());

        // Phase 1 of on_request: call with null body so header modifications are applied
        // before the upstream request is built. Fires for all requests including GET.
        // For plugin routes, phase 2 also runs here (inline, after reading the body).
        // For HTTP upstream routes, phase 2 runs in request_body_filter.
        for hook in &op.interceptors.on_request {
            let input = request_input_from_parts(
                &session.req_header().method,
                &session.req_header().uri,
                &session.req_header().headers,
                ctx.path_params.clone(),
                op.operation_meta.clone(),
            );
            let mut input_json = serde_json::to_value(&input).unwrap();
            merge_options(&mut input_json, hook.options.as_ref());

            let span = tracing::debug_span!(
                "interceptor_call",
                hook = "on_request",
                function = hook.function.as_str()
            );
            match call_interceptor(
                hook.runtime.as_ref(),
                &hook.function,
                input_json,
                None,
                hook.timeout,
            )
            .instrument(span)
            .await
            {
                Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
                    if let Some(mods) = headers {
                        apply_header_modifications(session.req_header_mut(), &mods);
                    }
                }
                Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                    session
                        .respond_error_with_body(
                            status,
                            body_out.map(js_body_to_bytes).unwrap_or_default(),
                        )
                        .await
                        .ok();
                    return Ok(true);
                }
                Err(e) => {
                    log::error!("on_request interceptor error: {}", e);
                    session
                        .respond_error_with_body(
                            500,
                            GatewayError::internal(format!("interceptor error: {}", e)).body(),
                        )
                        .await
                        .ok();
                    return Ok(true);
                }
            }
        }

        // For plugin routes: handle the entire request here and short-circuit the proxy pipeline.
        // This prevents upstream_peer from being called (which would return InternalError for
        // Upstream::Plugin). Returning Ok(true) skips all subsequent hooks.
        // The entire dispatch is wrapped in a timeout race — if the deadline is exceeded,
        // the future is dropped (cancelling all in-flight plugin/interceptor calls).
        if let Upstream::Plugin(plugin) = &route_arc.upstream {
            let backend_config = op.backend_config.clone();
            return match tokio::time::timeout(
                op.request_timeout,
                upstream_plugin::dispatch(session, ctx, op, plugin, backend_config),
            )
            .await
            {
                Ok(inner) => inner,
                Err(_elapsed) => {
                    log::warn!("request timeout exceeded for plugin route");
                    session
                        .respond_error_with_body(
                            504,
                            GatewayError::gateway_timeout("request timeout exceeded").body(),
                        )
                        .await
                        .ok();
                    Ok(true)
                }
            };
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
        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(());
        };

        // Skip if no on_request interceptors are configured.
        // Plugin routes are fully handled in request_filter and never reach here.
        if op.interceptors.on_request.is_empty() {
            return Ok(());
        }

        // Buffer chunks, suppressing forwarding until we're done processing
        if let Some(b) = body {
            ctx.request_body_buf.put(b.as_ref());
            b.clear();
        }

        if end_of_stream {
            let buf = ctx.request_body_buf.split().freeze();

            // Step 2: Phase 2 of on_request (body access). Only fires for non-empty bodies;
            // phase 1 in request_filter already ran. Here we apply body changes only --
            // header modifications are intentionally ignored since upstream headers were
            // already built before request_body_filter runs.
            let final_buf = if !op.interceptors.on_request.is_empty() && !buf.is_empty() {
                let content_type = session
                    .req_header()
                    .headers
                    .get(http::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                let mut current_buf = buf;
                for hook in &op.interceptors.on_request {
                    let js_body = js_body_from_content_type(content_type.as_deref(), &current_buf);
                    let input = request_input_from_parts(
                        &session.req_header().method,
                        &session.req_header().uri,
                        &session.req_header().headers,
                        ctx.path_params.clone(),
                        op.operation_meta.clone(),
                    );
                    let mut input_json = serde_json::to_value(&input).unwrap();
                    merge_options(&mut input_json, hook.options.as_ref());
                    let span = tracing::debug_span!(
                        "interceptor_call",
                        hook = "on_request_body",
                        function = hook.function.as_str()
                    );
                    match call_interceptor(
                        hook.runtime.as_ref(),
                        &hook.function,
                        input_json,
                        js_body,
                        hook.timeout,
                    )
                    .instrument(span)
                    .await
                    {
                        Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                            current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
                        }
                        Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                            session
                                .respond_error_with_body(
                                    status,
                                    body_out.map(js_body_to_bytes).unwrap_or_default(),
                                )
                                .await
                                .ok();
                            ctx.filter_responded = true;
                            return Ok(());
                        }
                        Err(e) => {
                            log::error!("on_request interceptor error: {}", e);
                            session
                                .respond_error_with_body(
                                    500,
                                    GatewayError::internal(format!("interceptor error: {}", e))
                                        .body(),
                                )
                                .await
                                .ok();
                            ctx.filter_responded = true;
                            return Ok(());
                        }
                    }
                }
                current_buf
            } else {
                buf
            };

            // Step 3: Restore body for upstream forwarding (only if non-empty)
            if !final_buf.is_empty() {
                *body = Some(final_buf);
            }
        }

        Ok(())
    }

    async fn upstream_request_filter(
        &self,
        _session: &mut Session,
        upstream_request: &mut RequestHeader,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<()>
    where
        Self::CTX: Send + Sync,
    {
        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(());
        };

        // When on_request is configured, the body may be modified in request_body_filter.
        // Replace Content-Length with Transfer-Encoding: chunked so pingora will stream
        // the (possibly resized) body to the upstream without a fixed length constraint.
        // Only apply to requests that actually carry a body (have Content-Length set).
        if !op.interceptors.on_request.is_empty()
            && upstream_request
                .headers
                .contains_key(http::header::CONTENT_LENGTH)
        {
            upstream_request.remove_header(&http::header::CONTENT_LENGTH);
            upstream_request
                .insert_header(http::header::TRANSFER_ENCODING, "chunked")
                .ok();
        }

        // When on_response_body is configured, we need to buffer and inspect the response body.
        // Prevent gzip encoding from the upstream so we receive raw bytes.
        if !op.interceptors.on_response_body.is_empty() {
            upstream_request
                .insert_header("accept-encoding", "identity")
                .ok();
        }

        for hook in &op.interceptors.before_upstream {
            let input = request_input_from_parts(
                &upstream_request.method,
                &upstream_request.uri,
                &upstream_request.headers,
                ctx.path_params.clone(),
                op.operation_meta.clone(),
            );
            let mut input_json = serde_json::to_value(&input).unwrap();
            merge_options(&mut input_json, hook.options.as_ref());

            let span = tracing::debug_span!(
                "interceptor_call",
                hook = "before_upstream",
                function = hook.function.as_str()
            );
            match call_interceptor(
                hook.runtime.as_ref(),
                &hook.function,
                input_json,
                None,
                hook.timeout,
            )
            .instrument(span)
            .await
            {
                Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
                    if let Some(mods) = &headers {
                        apply_header_modifications(upstream_request, mods);
                    }
                }
                Ok((InterceptorOutput::Respond { .. }, _)) => {
                    log::warn!(
                        "before_upstream interceptor returned 'respond' -- ignoring (request already committed to upstream)"
                    );
                }
                Err(e) => {
                    log::error!("before_upstream interceptor error: {}", e);
                }
            }
        }

        Ok(())
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
        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(());
        };

        for hook in &op.interceptors.on_response {
            let input = response_input_from_parts(
                upstream_response.status,
                &upstream_response.headers,
                op.operation_meta.clone(),
            );
            let mut input_json = serde_json::to_value(&input).unwrap();
            merge_options(&mut input_json, hook.options.as_ref());

            let span = tracing::debug_span!(
                "interceptor_call",
                hook = "on_response",
                function = hook.function.as_str()
            );
            match call_interceptor(
                hook.runtime.as_ref(),
                &hook.function,
                input_json,
                None,
                hook.timeout,
            )
            .instrument(span)
            .await
            {
                Ok((InterceptorOutput::Continue { status, headers }, _)) => {
                    if let Some(code) = status
                        && let Ok(status_code) = http::StatusCode::from_u16(code)
                    {
                        upstream_response.set_status(status_code).ok();
                    }
                    if let Some(mods) = &headers {
                        apply_header_modifications(upstream_response, mods);
                    }
                }
                Ok((InterceptorOutput::Respond { .. }, _)) => {
                    log::warn!(
                        "on_response interceptor returned 'respond' -- ignoring (response already in flight)"
                    );
                }
                Err(e) => {
                    log::error!("on_response interceptor error: {}", e);
                }
            }
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
        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(None);
        };

        if op.interceptors.on_response_body.is_empty() {
            return Ok(None);
        }

        // Buffer chunks, suppressing forwarding until end_of_stream
        if let Some(b) = body {
            ctx.response_body_buf.put(b.as_ref());
            b.clear();
        }

        if end_of_stream {
            let buf = ctx.response_body_buf.split().freeze();
            let status = ctx.upstream_response_status.unwrap_or(http::StatusCode::OK);

            let final_buf = tokio::task::block_in_place(|| {
                let mut current_buf = buf;
                for hook in &op.interceptors.on_response_body {
                    let js_body = js_body_from_content_type(
                        ctx.upstream_response_content_type.as_deref(),
                        &current_buf,
                    );
                    let input = response_input_from_parts(
                        status,
                        &http::HeaderMap::new(),
                        op.operation_meta.clone(),
                    );
                    let mut input_json = serde_json::to_value(&input).unwrap();
                    merge_options(&mut input_json, hook.options.as_ref());

                    let _span = tracing::debug_span!(
                        "interceptor_call",
                        hook = "on_response_body",
                        function = hook.function.as_str()
                    )
                    .entered();
                    match call_interceptor_blocking(
                        hook.runtime.as_ref(),
                        &hook.function,
                        input_json,
                        js_body,
                        hook.timeout,
                    ) {
                        Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                            current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
                        }
                        Ok((InterceptorOutput::Respond { .. }, _)) => {
                            log::warn!(
                                "on_response_body interceptor returned 'respond' -- ignoring"
                            );
                        }
                        Err(e) => {
                            log::error!("on_response_body interceptor error: {}", e);
                        }
                    }
                }
                current_buf
            });

            *body = Some(final_buf);
        }

        Ok(None)
    }

    async fn upstream_peer(
        &self,
        _session: &mut Session,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Box<HttpPeer>> {
        if ctx.filter_responded {
            return Err(pingora_core::Error::new(
                pingora_core::ErrorType::HTTPStatus(400),
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
            crate::path_match::Upstream::Plugin(_) => {
                // Should never be reached -- plugin routes return Ok(true) from request_filter,
                // skipping upstream_peer entirely. This branch is a safety net.
                Err(pingora_core::Error::new(
                    pingora_core::ErrorType::InternalError,
                ))
            }
        }
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
        // When an overall request timeout is active and the upstream error is a timeout,
        // return 504 with a JSON body instead of pingora's default error page.
        if ctx.request_start.is_some() && request_timeout::is_timeout_error(e) {
            session
                .respond_error_with_body(
                    504,
                    GatewayError::gateway_timeout("request timeout exceeded").body(),
                )
                .await
                .ok();
            return FailToProxy {
                error_code: 504,
                can_reuse_downstream: false,
            };
        }

        // Fall through to default pingora behaviour for non-timeout errors.
        session.respond_error(502).await.ok();
        FailToProxy {
            error_code: 502,
            can_reuse_downstream: false,
        }
    }
}

pub fn build_gateway(config: &Config, config_path: &str) -> Result<Plenum, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);
    let router = build_router(config, paths, std::path::Path::new(config_path))?;
    Ok(Plenum { router })
}
