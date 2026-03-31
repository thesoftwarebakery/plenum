use std::collections::BTreeMap;
use std::error::Error;
use std::sync::Arc;
use std::time::Duration;

use bytes::{Bytes, BytesMut, BufMut};
use config::Config;
use http::Method;
use interceptor::{InterceptorOutput, request_input_from_parts, response_input_from_parts};
use opengateway_js_runtime::JsRuntimeHandle;
use path_match::{build_router, RouteEntry};
use pingora_http::{RequestHeader, ResponseHeader};
use validation::error::ValidationErrorResponse;

use async_trait::async_trait;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};

pub mod config;
pub mod interceptor;
pub mod upstream_http;
pub mod path_match;
pub mod validation;

const INTERCEPTOR_TIMEOUT: Duration = Duration::from_secs(30);

pub struct GatewayCtx {
    matched_route: Option<Arc<RouteEntry>>,
    matched_method: Option<Method>,
    request_body_buf: BytesMut,
    request_body_validation_failed: bool,
}

pub struct OpenGateway {
    router: path_match::OpenGatewayRouter,
}

/// Call a JS interceptor and deserialize the output.
async fn call_interceptor(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
) -> Result<InterceptorOutput, Box<dyn Error + Send + Sync>> {
    let result_json = handle.call(function_name, input, INTERCEPTOR_TIMEOUT).await?;
    let output: InterceptorOutput = serde_json::from_value(result_json)?;
    Ok(output)
}

/// Apply header modifications to a pingora RequestHeader.
fn apply_request_header_modifications(
    req: &mut RequestHeader,
    modifications: &std::collections::HashMap<String, Option<String>>,
) {
    for (name, value) in modifications {
        match value {
            Some(v) => {
                let name_owned = name.to_string();
                if let Err(e) = req.insert_header(name_owned, v) {
                    log::warn!("interceptor: failed to set header {}: {}", name, e);
                }
            }
            None => {
                let _ = req.remove_header(name.as_str());
            }
        }
    }
}

/// Apply header modifications to a pingora ResponseHeader.
fn apply_response_header_modifications(
    resp: &mut ResponseHeader,
    modifications: &std::collections::HashMap<String, Option<String>>,
) {
    for (name, value) in modifications {
        match value {
            Some(v) => {
                let name_owned = name.to_string();
                if let Err(e) = resp.insert_header(name_owned, v) {
                    log::warn!("interceptor: failed to set header {}: {}", name, e);
                }
            }
            None => {
                let _ = resp.remove_header(name.as_str());
            }
        }
    }
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

        // Run on_request interceptor if configured
        let method = ctx.matched_method.as_ref().unwrap();
        if let Some(op) = ctx.matched_route.as_ref().unwrap().operations.get(method) {
            if let Some(handle) = &op.interceptors.on_request {
                let input = request_input_from_parts(
                    &session.req_header().method,
                    &session.req_header().uri,
                    &session.req_header().headers,
                );
                let input_json = serde_json::to_value(&input).unwrap();

                match call_interceptor(handle, "onRequest", input_json).await {
                    Ok(InterceptorOutput::Continue { headers, .. }) => {
                        if let Some(modifications) = &headers {
                            apply_request_header_modifications(
                                session.req_header_mut(),
                                modifications,
                            );
                        }
                    }
                    Ok(InterceptorOutput::Respond { status, headers, body }) => {
                        let body_bytes = body.unwrap_or_default();
                        if let Some(h) = &headers {
                            let Ok(mut resp) = ResponseHeader::build(status, Some(h.len() + 1)) else {
                                log::error!("on_request interceptor returned invalid status code: {}", status);
                                session.respond_error_with_body(500, Bytes::from("{\"error\": \"interceptor returned invalid status\"}")).await.ok();
                                return Ok(true);
                            };
                            for (name, value) in h {
                                if let (Ok(n), Ok(v)) = (name.parse::<http::header::HeaderName>(), value.parse::<http::header::HeaderValue>()) {
                                    resp.insert_header(n, v).ok();
                                }
                            }
                            resp.insert_header(http::header::CONTENT_LENGTH, body_bytes.len()).ok();
                            session.write_response_header(Box::new(resp), false).await.ok();
                            session.write_response_body(Some(Bytes::from(body_bytes)), true).await.ok();
                        } else {
                            session.respond_error_with_body(status, Bytes::from(body_bytes)).await.ok();
                        }
                        return Ok(true);
                    }
                    Err(e) => {
                        log::error!("on_request interceptor error: {}", e);
                        session.respond_error_with_body(
                            500,
                            Bytes::from(format!("{{\"error\": \"interceptor error: {}\"}}", e)),
                        ).await.ok();
                        return Ok(true);
                    }
                }
            }
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

    async fn upstream_request_filter(
        &self,
        _session: &mut Session,
        upstream_request: &mut RequestHeader,
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

        if let Some(handle) = &op.interceptors.before_upstream {
            let input = request_input_from_parts(
                &upstream_request.method,
                &upstream_request.uri,
                &upstream_request.headers,
            );
            let input_json = serde_json::to_value(&input).unwrap();

            match call_interceptor(handle, "beforeUpstream", input_json).await {
                Ok(InterceptorOutput::Continue { headers, .. }) => {
                    if let Some(modifications) = &headers {
                        apply_request_header_modifications(upstream_request, modifications);
                    }
                }
                Ok(InterceptorOutput::Respond { .. }) => {
                    log::warn!("before_upstream interceptor returned 'respond' — ignoring (request already committed to upstream)");
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

        if let Some(handle) = &op.interceptors.on_response {
            let input = response_input_from_parts(
                upstream_response.status,
                &upstream_response.headers,
            );
            let input_json = serde_json::to_value(&input).unwrap();

            match call_interceptor(handle, "onResponse", input_json).await {
                Ok(InterceptorOutput::Continue { status, headers }) => {
                    if let Some(code) = status {
                        if let Ok(status_code) = http::StatusCode::from_u16(code) {
                            upstream_response.set_status(status_code).ok();
                        }
                    }
                    if let Some(modifications) = &headers {
                        apply_response_header_modifications(upstream_response, modifications);
                    }
                }
                Ok(InterceptorOutput::Respond { .. }) => {
                    log::warn!("on_response interceptor returned 'respond' — ignoring (response already in flight)");
                }
                Err(e) => {
                    log::error!("on_response interceptor error: {}", e);
                }
            }
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

pub fn build_gateway(config: &Config, config_path: &str) -> Result<OpenGateway, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);

    let router = build_router(config, paths, std::path::Path::new(config_path))?;

    Ok(OpenGateway { router })
}
