use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use config::Config;
use gateway_error::GatewayError;
use path_match::{HookHandle, OperationSchemas, Upstream, build_router};
use pingora_core::upstreams::peer::HttpPeer;
use pingora_http::ResponseHeader;
use pingora_proxy::{FailToProxy, ProxyHttp, Session};
use tokio_util::sync::CancellationToken;

pub mod config;
mod ctx;
pub mod gateway_error;
mod headers;
pub mod interceptor;
mod openapi;
pub mod path_match;
mod phases;
mod proxy_utils;
pub mod request_timeout;
pub mod upstream_peer;
pub mod upstream_plugin;

pub use ctx::GatewayCtx;

pub struct Plenum {
    router: path_match::PlenumRouter,
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

        // Plugin routes: wrap on_request phase 1 + dispatch in a single timeout.
        if let Upstream::Plugin(plugin) = &route_arc.upstream {
            let backend_config = op.backend_config.clone();
            return match pingora_timeout::timeout(op.request_timeout, async {
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

        // HTTP/Static routes: budget-capped on_request phase 1.
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
            session
                .write_response_body(Some(static_resp.body.clone()), true)
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
        let Some(op) = route_arc.operations.get(&method) else {
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
        let Some(op) = route_arc.operations.get(&method) else {
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
        let Some(op) = route_arc.operations.get(&method) else {
            return Ok(());
        };

        phases::on_response::run(upstream_response, ctx, op).await?;

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
        let Some(op) = route_arc.operations.get(&method) else {
            return Ok(None);
        };

        if op.interceptors.on_response_body.is_empty() {
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
        _session: &mut Session,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Box<HttpPeer>> {
        phases::upstream_peer::resolve(ctx)
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
