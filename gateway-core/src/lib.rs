use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::sync::Arc;
use std::time::Duration;

use bytes::{BufMut, Bytes, BytesMut};
use config::Config;
use http::Method;
use interceptor::{
    InterceptorOutput, header_map_to_hash_map, request_input_from_parts, response_input_from_parts,
};
use opengateway_js_runtime::{JsBody, JsRuntimeHandle};
use path_match::{OperationSchemas, RouteEntry, Upstream, build_router};
use pingora_http::{RequestHeader, ResponseHeader};
use validation::error::ValidationErrorResponse;

use async_trait::async_trait;
use gateway_error::GatewayError;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};
use tracing::Instrument;

pub mod config;
pub mod gateway_error;
pub mod interceptor;
mod openapi;
pub mod path_match;
pub mod upstream_http;
pub mod validation;

pub struct GatewayCtx {
    matched_route: Option<Arc<RouteEntry>>,
    matched_method: Option<Method>,
    request_body_buf: BytesMut,
    request_body_validation_failed: bool,
    response_body_buf: BytesMut,
    upstream_response_status: Option<http::StatusCode>,
    upstream_response_content_type: Option<String>,
    path_params: HashMap<String, String>,
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
    timeout: Duration,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call(function_name, input, body, timeout).await?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}

/// Synchronous variant of call_interceptor for use from sync body filters.
fn call_interceptor_blocking(
    handle: &JsRuntimeHandle,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
    timeout: Duration,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call_blocking(function_name, input, body, timeout)?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}

/// Helper to merge interceptor options into the input JSON value.
fn merge_options(input_json: &mut serde_json::Value, options: Option<&serde_json::Value>) {
    if let (Some(opts), serde_json::Value::Object(map)) = (options, input_json) {
        map.insert("options".to_string(), opts.clone());
    }
}

/// Determine the JS body representation for a buffer based on the request content-type.
/// Returns None if the buffer is empty.
fn js_body_from_content_type(content_type: Option<&str>, buf: &[u8]) -> Option<JsBody> {
    if buf.is_empty() {
        return None;
    }
    match content_type {
        Some(ct) if ct.starts_with("application/json") => serde_json::from_slice(buf)
            .ok()
            .map(JsBody::Json)
            .or_else(|| Some(JsBody::Bytes(buf.to_vec()))),
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

/// Convert a `HashMap<String, String>` back to an `http::HeaderMap`.
fn headers_hashmap_to_http_headermap(map: &HashMap<String, String>) -> http::HeaderMap {
    let mut header_map = http::HeaderMap::new();
    for (k, v) in map {
        if let (Ok(name), Ok(value)) = (
            http::header::HeaderName::from_bytes(k.as_bytes()),
            http::header::HeaderValue::from_str(v),
        ) {
            header_map.insert(name, value);
        }
    }
    header_map
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

impl HeaderEdit for http::HeaderMap {
    fn set_header(&mut self, name: &str, value: &str) {
        if let (Ok(n), Ok(v)) = (
            http::header::HeaderName::from_bytes(name.as_bytes()),
            http::HeaderValue::from_str(value),
        ) {
            self.insert(n, v);
        } else {
            log::warn!("interceptor: failed to set header {}", name);
        }
    }
    fn del_header(&mut self, name: &str) {
        if let Ok(n) = http::header::HeaderName::from_bytes(name.as_bytes()) {
            self.remove(n);
        }
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
            path_params: HashMap::new(),
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

        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(false);
        };

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
                &hook.runtime,
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
        let is_plugin = matches!(
            ctx.matched_route.as_ref().map(|r| &r.upstream),
            Some(Upstream::Plugin(_))
        );

        if is_plugin {
            // Read the full request body from the downstream connection.
            let mut body_bytes = BytesMut::new();
            loop {
                match session.downstream_session.read_request_body().await {
                    Ok(Some(chunk)) => body_bytes.put(chunk.as_ref()),
                    Ok(None) => break,
                    Err(e) => {
                        log::error!("error reading request body: {}", e);
                        session
                            .respond_error_with_body(
                                500,
                                GatewayError::internal(format!(
                                    "error reading request body: {}",
                                    e
                                ))
                                .body(),
                            )
                            .await
                            .ok();
                        return Ok(true);
                    }
                }
            }
            let buf = body_bytes.freeze();

            // Step 1: Validate against schema (if configured)
            let req_content_type = session
                .req_header()
                .headers
                .get(http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
                .unwrap_or_else(|| "application/json".to_string());
            if let Some(schema) = op.request_body.get(&req_content_type) {
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
                        return Ok(true);
                    }
                };
                if let Err(issues) = {
                    let _span =
                        tracing::debug_span!("validation", phase = "request_body").entered();
                    schema.validate(&parsed)
                } {
                    let err = ValidationErrorResponse::request_error(issues);
                    session
                        .respond_error_with_body(400, Bytes::from(err.to_json()))
                        .await
                        .ok();
                    return Ok(true);
                }
            }

            // Step 2: Phase 2 of on_request with body access.
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
                        &hook.runtime,
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
                            return Ok(true);
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
                            return Ok(true);
                        }
                    }
                }
                current_buf
            } else {
                buf
            };

            // Borrow the plugin handle from the matched route.
            let route = ctx.matched_route.as_ref().unwrap();
            let Upstream::Plugin(plugin) = &route.upstream else {
                unreachable!()
            };
            let plugin_runtime = plugin.runtime.clone();
            let plugin_timeout = plugin.timeout;
            let path_params = ctx.path_params.clone();

            // Step A: before_upstream interceptors
            let mut request_headers = session.req_header().headers.clone();
            for hook in &op.interceptors.before_upstream {
                let input = request_input_from_parts(
                    &session.req_header().method,
                    &session.req_header().uri,
                    &request_headers,
                    path_params.clone(),
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
                    &hook.runtime,
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
                            apply_header_modifications(&mut request_headers, &mods);
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
                        log::error!("before_upstream interceptor error: {}", e);
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

            // Step B: call plugin handle()
            let backend_config = op.backend_config.clone().unwrap_or(serde_json::Value::Null);
            let plugin_input = serde_json::json!({
                "request": {
                    "method": session.req_header().method.to_string(),
                    "path": session.req_header().uri.path(),
                    "query": session.req_header().uri.query().unwrap_or(""),
                    "headers": header_map_to_hash_map(&request_headers),
                    "params": path_params,
                },
                "config": backend_config,
                "operation": op.operation_meta,
            });
            let js_body = js_body_from_content_type(
                session
                    .req_header()
                    .headers
                    .get(http::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok()),
                &final_buf,
            );

            let (mut plugin_status, mut plugin_headers, plugin_body) = match plugin_runtime
                .call("handle", plugin_input, js_body, plugin_timeout)
                .await
            {
                Ok(output) => {
                    let status = output
                        .value
                        .get("status")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(200) as u16;
                    let headers: HashMap<String, String> = output
                        .value
                        .get("headers")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or_default();
                    (status, headers, output.body)
                }
                Err(e) => {
                    log::error!("plugin handle() error: {}", e);
                    session
                        .respond_error_with_body(
                            500,
                            GatewayError::internal(format!("plugin error: {}", e)).body(),
                        )
                        .await
                        .ok();
                    return Ok(true);
                }
            };

            // Step C: on_response interceptors
            for hook in &op.interceptors.on_response {
                let input = response_input_from_parts(
                    http::StatusCode::from_u16(plugin_status).unwrap_or(http::StatusCode::OK),
                    &headers_hashmap_to_http_headermap(&plugin_headers),
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
                    &hook.runtime,
                    &hook.function,
                    input_json,
                    None,
                    hook.timeout,
                )
                .instrument(span)
                .await
                {
                    Ok((
                        InterceptorOutput::Continue {
                            status, headers, ..
                        },
                        _,
                    )) => {
                        if let Some(s) = status {
                            plugin_status = s;
                        }
                        if let Some(mods) = headers {
                            for (k, v) in mods {
                                match v {
                                    Some(val) => {
                                        plugin_headers.insert(k, val);
                                    }
                                    None => {
                                        plugin_headers.remove(&k);
                                    }
                                }
                            }
                        }
                    }
                    Ok((InterceptorOutput::Respond { .. }, _)) => {
                        log::warn!(
                            "on_response interceptor returned 'respond' action for plugin route -- ignored"
                        );
                    }
                    Err(e) => {
                        log::error!("on_response interceptor error: {}", e);
                    }
                }
            }

            // Step D: on_response_body interceptors
            let mut response_body_bytes = plugin_body.map(js_body_to_bytes).unwrap_or_default();
            let response_content_type = plugin_headers.get("content-type").cloned();
            for hook in &op.interceptors.on_response_body {
                let js_body = js_body_from_content_type(
                    response_content_type.as_deref(),
                    &response_body_bytes,
                );
                let input = response_input_from_parts(
                    http::StatusCode::from_u16(plugin_status).unwrap_or(http::StatusCode::OK),
                    &headers_hashmap_to_http_headermap(&plugin_headers),
                    op.operation_meta.clone(),
                );
                let mut input_json = serde_json::to_value(&input).unwrap();
                merge_options(&mut input_json, hook.options.as_ref());
                match call_interceptor(
                    &hook.runtime,
                    &hook.function,
                    input_json,
                    js_body,
                    hook.timeout,
                )
                .await
                {
                    Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                        if let Some(b) = body_out {
                            response_body_bytes = js_body_to_bytes(b);
                        }
                    }
                    Ok((InterceptorOutput::Respond { .. }, _)) => {
                        log::warn!(
                            "on_response_body interceptor returned 'respond' action for plugin route -- ignored"
                        );
                    }
                    Err(e) => {
                        log::error!("on_response_body interceptor error: {}", e);
                    }
                }
            }

            // Step E: write response
            let mut resp_header = pingora_http::ResponseHeader::build(plugin_status, None)
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "build response header",
                        e,
                    )
                })?;
            for (name, value) in &plugin_headers {
                resp_header.insert_header(name.clone(), value.as_str()).ok();
            }
            session
                .write_response_header(Box::new(resp_header), false)
                .await
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "write response header",
                        e,
                    )
                })?;
            session
                .write_response_body(Some(response_body_bytes), true)
                .await
                .map_err(|e| {
                    pingora_core::Error::because(
                        pingora_core::ErrorType::InternalError,
                        "write response body",
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
        let Some(op) = matched_op(&ctx.matched_route, &ctx.matched_method) else {
            return Ok(());
        };

        // Skip if neither validation nor on_request interceptor is configured.
        // Plugin routes are fully handled in request_filter and never reach here.
        if op.request_body.is_empty() && op.interceptors.on_request.is_empty() {
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
            let req_content_type = session
                .req_header()
                .headers
                .get(http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
                .unwrap_or_else(|| "application/json".to_string());
            if let Some(schema) = op.request_body.get(&req_content_type) {
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
                if let Err(issues) = {
                    let _span =
                        tracing::debug_span!("validation", phase = "request_body").entered();
                    schema.validate(&parsed)
                } {
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
                        &hook.runtime,
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
                &hook.runtime,
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
                &hook.runtime,
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
                        &hook.runtime,
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
        if ctx.request_body_validation_failed {
            return Err(pingora_core::Error::new(
                pingora_core::ErrorType::HTTPStatus(400),
            ));
        }
        let route = ctx
            .matched_route
            .as_ref()
            .ok_or_else(|| pingora_core::Error::new(pingora_core::ErrorType::InternalError))?;
        match &route.upstream {
            crate::path_match::Upstream::Http(peer) => Ok(Box::new(*peer.clone())),
            crate::path_match::Upstream::Plugin(_) => {
                // Should never be reached -- plugin routes return Ok(true) from request_filter,
                // skipping upstream_peer entirely. This branch is a safety net.
                Err(pingora_core::Error::new(
                    pingora_core::ErrorType::InternalError,
                ))
            }
        }
    }
}

pub fn build_gateway(config: &Config, config_path: &str) -> Result<OpenGateway, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);
    let router = build_router(config, paths, std::path::Path::new(config_path))?;
    Ok(OpenGateway { router })
}
