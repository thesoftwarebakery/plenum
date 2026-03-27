use std::collections::BTreeMap;
use std::error::Error;
use std::sync::Arc;

use bytes::{Bytes, BytesMut, BufMut};
use config::Config;
use http::Method;
use path_match::{build_router, RouteEntry};
use validation::error::ValidationErrorResponse;

use async_trait::async_trait;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};

pub mod config;
pub mod interceptor;
pub mod upstream_http;
pub mod path_match;
pub mod validation;

pub struct GatewayCtx {
    matched_route: Option<Arc<RouteEntry>>,
    matched_method: Option<Method>,
    request_body_buf: BytesMut,
    request_body_validation_failed: bool,
}

pub struct OpenGateway {
    router: path_match::OpenGatewayRouter,
}

#[async_trait]
impl ProxyHttp for OpenGateway {
    type CTX = GatewayCtx;

    fn new_ctx(&self) -> Self::CTX {
        GatewayCtx {
            matched_route: None,
            matched_method: None,
            request_body_buf: BytesMut::new(),
            request_body_validation_failed: false,
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
        let matched = self.router.at(path).map_err(|e| {
            log::warn!("No route matched for path: {}", path);
            pingora_core::Error::because(
                pingora_core::ErrorType::HTTPStatus(404),
                "no matching route",
                e,
            )
        })?;
        ctx.matched_route = Some(matched.value.clone());
        ctx.matched_method = Some(session.req_header().method.clone());
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
        let route = match ctx.matched_route.as_ref() {
            Some(r) => r,
            None => return Ok(()),
        };
        let method = match ctx.matched_method.as_ref() {
            Some(m) => m,
            None => return Ok(()),
        };
        let op = match route.operations.get(method) {
            Some(o) => o,
            None => return Ok(()),
        };

        // No request body schema defined — skip validation
        if op.request_body.is_none() {
            return Ok(());
        }

        // Buffer chunks
        if let Some(b) = body {
            ctx.request_body_buf.put(b.as_ref());
            // Clear the body to suppress forwarding until we've validated
            b.clear();
        }

        if end_of_stream {
            let schema = op.request_body.as_ref().unwrap();
            let buf = &ctx.request_body_buf;

            // Parse the buffered body as JSON
            let parsed: serde_json::Value = match serde_json::from_slice(buf) {
                Ok(v) => v,
                Err(_) => {
                    let err = ValidationErrorResponse::request_error(vec![
                        validation::error::ValidationIssue {
                            path: "".into(),
                            message: "request body is not valid JSON".into(),
                        },
                    ]);
                    session
                        .respond_error_with_body(400, Bytes::from(err.to_json()))
                        .await
                        .ok();
                    ctx.request_body_validation_failed = true;
                    return Ok(());
                }
            };

            // Validate against schema
            if let Err(issues) = schema.validate(&parsed) {
                let err = ValidationErrorResponse::request_error(issues);
                session
                    .respond_error_with_body(400, Bytes::from(err.to_json()))
                    .await
                    .ok();
                ctx.request_body_validation_failed = true;
                return Ok(());
            }

            // Validation passed — restore the body for upstream forwarding
            *body = Some(Bytes::from(ctx.request_body_buf.split().freeze()));
        }

        Ok(())
    }

    async fn upstream_peer(
        &self,
        _session: &mut Session,
        ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Box<HttpPeer>> {
        if ctx.request_body_validation_failed {
            return Err(pingora_core::Error::new(pingora_core::ErrorType::HTTPStatus(400)));
        }
        let route = ctx.matched_route.as_ref().ok_or_else(|| {
            pingora_core::Error::new(pingora_core::ErrorType::InternalError)
        })?;
        Ok(Box::new(route.peer.clone()))
    }
}

pub fn build_gateway(config: &Config) -> Result<OpenGateway, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);

    let router = build_router(config, paths)?;

    Ok(OpenGateway { router })
}
