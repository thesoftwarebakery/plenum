use std::collections::BTreeMap;
use std::error::Error;
use std::sync::Arc;
use std::time::Duration;

use bytes::{Bytes, BytesMut, BufMut};
use config::Config;
use http::Method;
use interceptor::{InterceptorOutput, request_input_from_parts, response_input_from_parts};
use opengateway_js_runtime::{JsBody, JsRuntimeHandle};
use path_match::{build_router, OperationSchemas, RouteEntry};
use pingora_http::{RequestHeader, ResponseHeader};
use validation::error::ValidationErrorResponse;

use gateway_error::GatewayError;
use async_trait::async_trait;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};

pub mod config;
pub mod gateway_error;
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
    response_body_buf: BytesMut,
    upstream_response_status: Option<http::StatusCode>,
    upstream_response_content_type: Option<String>,
}

pub struct OpenGateway {
    router: path_match::OpenGatewayRouter,
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

/// Call a JS interceptor and deserialize the output.
/// Returns the deserialized InterceptorOutput and any modified body.
async fn call_interceptor(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call(function_name, input, body, INTERCEPTOR_TIMEOUT).await?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}

/// Synchronous variant of call_interceptor for use from sync body filters.
fn call_interceptor_blocking(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call_blocking(function_name, input, body, INTERCEPTOR_TIMEOUT)?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}

/// Determine the JS body representation for a buffer based on the request content-type.
/// Returns None if the buffer is empty.
fn js_body_from_content_type(content_type: Option<&str>, buf: &[u8]) -> Option<JsBody> {
    if buf.is_empty() {
        return None;
    }
    match content_type {
        Some(ct) if ct.starts_with("application/json") => {
            serde_json::from_slice(buf).ok().map(JsBody::Json).or_else(|| Some(JsBody::Bytes(buf.to_vec())))
        }
        Some(ct)
            if ct.starts_with("text/")
                || ct.starts_with("application/xml")
                || ct.starts_with("application/x-www-form-urlencoded") =>
        {
            Some(JsBody::Text(String::from_utf8_lossy(buf).into_owned()))
        }
        _ => Some(JsBody::Bytes(buf.to_vec())),
    }
}

/// Convert a JsBody back to raw bytes for forwarding.
fn js_body_to_bytes(body: JsBody) -> Bytes {
    match body {
        JsBody::Json(v) => Bytes::from(serde_json::to_vec(&v).unwrap_or_default()),
        JsBody::Text(s) => Bytes::from(s.into_bytes()),
        JsBody::Bytes(b) => Bytes::from(b),
    }
}

/// Shared interface for applying header modifications, implemented by both request and
/// response headers. Keeping this private avoids coupling to pingora's header types.
trait HeaderEdit {
    fn set_header(&mut self, name: &str, value: &str);
    fn del_header(&mut self, name: &str);
}

impl HeaderEdit for RequestHeader {
    fn set_header(&mut self, name: &str, value: &str) {
        if let Err(e) = self.insert_header(name.to_string(), value) {
            log::warn!("interceptor: failed to set header {}: {}", name, e);
        }
    }
    fn del_header(&mut self, name: &str) {
        let _ = self.remove_header(name);
    }
}

impl HeaderEdit for ResponseHeader {
    fn set_header(&mut self, name: &str, value: &str) {
        if let Err(e) = self.insert_header(name.to_string(), value) {
            log::warn!("interceptor: failed to set header {}: {}", name, e);
        }
    }
    fn del_header(&mut self, name: &str) {
        let _ = self.remove_header(name);
    }
}

fn apply_header_modifications<H: HeaderEdit>(
    header: &mut H,
    modifications: &std::collections::HashMap<String, Option<String>>,
) {
    for (name, value) in modifications {
        match value {
            Some(v) => header.set_header(name, v),
            None => header.del_header(name),
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
            response_body_buf: BytesMut::new(),
            upstream_response_status: None,
            upstream_response_content_type: None,
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

        // Phase 1 of on_request: call with null body so header modifications are applied
        // before the upstream request is built. Fires for all requests including GET.
        // For requests with a body, phase 2 runs in request_body_filter to handle body access.
        if let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) {
            if let Some(handle) = op.interceptors.on_request.as_ref() {
                let input = request_input_from_parts(
                    &session.req_header().method,
                    &session.req_header().uri,
                    &session.req_header().headers,
                );
                let input_json = serde_json::to_value(&input).unwrap();

                match call_interceptor(handle, "onRequest", input_json, None).await {
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

        // Skip if neither validation nor on_request interceptor is configured
        if op.request_body.is_none() && op.interceptors.on_request.is_none() {
            return Ok(());
        }

        // Buffer chunks, suppressing forwarding until we're done processing
        if let Some(b) = body {
            ctx.request_body_buf.put(b.as_ref());
            b.clear();
        }

        if end_of_stream {
            let buf = ctx.request_body_buf.split().freeze();

            // Step 1: Validate against schema (if configured)
            if let Some(schema) = op.request_body.as_ref() {
                let parsed: serde_json::Value = match serde_json::from_slice(&buf) {
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
                if let Err(issues) = schema.validate(&parsed) {
                    let err = ValidationErrorResponse::request_error(issues);
                    session
                        .respond_error_with_body(400, Bytes::from(err.to_json()))
                        .await
                        .ok();
                    ctx.request_body_validation_failed = true;
                    return Ok(());
                }
            }

            // Step 2: Phase 2 of on_request (body access). Only fires for non-empty bodies;
            // phase 1 in request_filter already ran. Here we apply body changes only --
            // header modifications are intentionally ignored since upstream headers were
            // already built before request_body_filter runs.
            let final_buf = if let Some(handle) = op.interceptors.on_request.as_ref() {
                if buf.is_empty() {
                    buf
                } else {
                    let content_type = session
                        .req_header()
                        .headers
                        .get(http::header::CONTENT_TYPE)
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let js_body = js_body_from_content_type(content_type.as_deref(), &buf);
                    let input = request_input_from_parts(
                        &session.req_header().method,
                        &session.req_header().uri,
                        &session.req_header().headers,
                    );
                    let input_json = serde_json::to_value(&input).unwrap();

                    match call_interceptor(handle, "onRequest", input_json, js_body).await {
                        Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                            body_out.map(js_body_to_bytes).unwrap_or(buf)
                        }
                        Ok((InterceptorOutput::Respond { status, .. }, body_out)) => {
                            session
                                .respond_error_with_body(
                                    status,
                                    body_out.map(js_body_to_bytes).unwrap_or_default(),
                                )
                                .await
                                .ok();
                            ctx.request_body_validation_failed = true;
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
                            ctx.request_body_validation_failed = true;
                            return Ok(());
                        }
                    }
                }
            } else {
                buf
            };

            // Step 3: Restore body for upstream forwarding
            *body = Some(final_buf);
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
        if op.interceptors.on_request.is_some() {
            upstream_request.remove_header(&http::header::CONTENT_LENGTH);
            upstream_request
                .insert_header(http::header::TRANSFER_ENCODING, "chunked")
                .ok();
        }

        // When on_response_body is configured, we need to buffer and inspect the response body.
        // Prevent gzip encoding from the upstream so we receive raw bytes.
        if op.interceptors.on_response_body.is_some() {
            upstream_request.insert_header("accept-encoding", "identity").ok();
        }

        if let Some(handle) = &op.interceptors.before_upstream {
            let input = request_input_from_parts(
                &upstream_request.method,
                &upstream_request.uri,
                &upstream_request.headers,
            );
            let input_json = serde_json::to_value(&input).unwrap();

            match call_interceptor(handle, "beforeUpstream", input_json, None).await {
                Ok((InterceptorOutput::Continue { headers, .. }, _)) => {
                    if let Some(mods) = &headers {
                        apply_header_modifications(upstream_request, mods);
                    }
                }
                Ok((InterceptorOutput::Respond { .. }, _)) => {
                    log::warn!("before_upstream interceptor returned 'respond' -- ignoring (request already committed to upstream)");
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

        if let Some(handle) = &op.interceptors.on_response {
            let input = response_input_from_parts(
                upstream_response.status,
                &upstream_response.headers,
            );
            let input_json = serde_json::to_value(&input).unwrap();

            match call_interceptor(handle, "onResponse", input_json, None).await {
                Ok((InterceptorOutput::Continue { status, headers }, _)) => {
                    if let Some(code) = status {
                        if let Ok(status_code) = http::StatusCode::from_u16(code) {
                            upstream_response.set_status(status_code).ok();
                        }
                    }
                    if let Some(mods) = &headers {
                        apply_header_modifications(upstream_response, mods);
                    }
                }
                Ok((InterceptorOutput::Respond { .. }, _)) => {
                    log::warn!("on_response interceptor returned 'respond' -- ignoring (response already in flight)");
                }
                Err(e) => {
                    log::error!("on_response interceptor error: {}", e);
                }
            }
        }

        // When on_response_body is configured, strip Content-Length (body size may change)
        // and store metadata in ctx for use in upstream_response_body_filter.
        if op.interceptors.on_response_body.is_some() {
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

        if op.interceptors.on_response_body.is_none() {
            return Ok(None);
        }

        // Buffer chunks, suppressing forwarding until end_of_stream
        if let Some(b) = body {
            ctx.response_body_buf.put(b.as_ref());
            b.clear();
        }

        if end_of_stream {
            let handle = op.interceptors.on_response_body.as_ref().unwrap();
            let buf = ctx.response_body_buf.split().freeze();
            let js_body =
                js_body_from_content_type(ctx.upstream_response_content_type.as_deref(), &buf);
            let status = ctx.upstream_response_status.unwrap_or(http::StatusCode::OK);
            let input = response_input_from_parts(status, &http::HeaderMap::new());
            let input_json = serde_json::to_value(&input).unwrap();

            // Use block_in_place so the blocking JS call can use tokio's blocking_send/recv
            // from within pingora's async execution context.
            let final_buf = tokio::task::block_in_place(|| {
                match call_interceptor_blocking(handle, "onResponseBody", input_json, js_body) {
                    Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                        body_out.map(js_body_to_bytes).unwrap_or(buf)
                    }
                    Ok((InterceptorOutput::Respond { .. }, _)) => {
                        log::warn!("on_response_body interceptor returned 'respond' -- ignoring");
                        buf
                    }
                    Err(e) => {
                        log::error!("on_response_body interceptor error: {}", e);
                        buf
                    }
                }
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
