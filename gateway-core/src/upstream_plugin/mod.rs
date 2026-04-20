use std::collections::HashMap;

use bytes::{BufMut, BytesMut};
use crate::ctx::GatewayCtx;
use crate::gateway_error::GatewayError;
use crate::headers::{apply_header_modifications, headers_hashmap_to_http_headermap};
use crate::interceptor::{InterceptorOutput, header_map_to_hash_map, request_input_from_parts, response_input_from_parts};
use crate::path_match::{OperationSchemas, PluginHandle};
use crate::proxy_utils::{call_interceptor, js_body_from_content_type, js_body_to_bytes, merge_options};
use pingora_proxy::Session;
use tracing::Instrument;

/// Handle a plugin route request end-to-end:
/// reads the request body, runs interceptors, calls the plugin handle(), runs response
/// interceptors, and writes the response to the downstream session.
/// Returns `Ok(true)` — the Pingora pipeline is short-circuited.
pub(crate) async fn dispatch(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
    plugin: &PluginHandle,
    backend_config: Option<serde_json::Value>,
) -> pingora_core::Result<bool> {
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
                        GatewayError::internal(format!("error reading request body: {}", e))
                            .body(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
        }
    }
    let buf = body_bytes.freeze();

    // Phase 2 of on_request with body access.
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
        current_buf
    } else {
        buf
    };

    // Step A: before_upstream interceptors
    let mut request_headers = session.req_header().headers.clone();
    for hook in &op.interceptors.before_upstream {
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &request_headers,
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
    let backend_config_value = backend_config.unwrap_or(serde_json::Value::Null);
    let plugin_input = serde_json::json!({
        "request": {
            "method": session.req_header().method.to_string(),
            "path": session.req_header().uri.path(),
            "query": session.req_header().uri.query().unwrap_or(""),
            "headers": header_map_to_hash_map(&request_headers),
            "params": ctx.path_params,
        },
        "config": backend_config_value,
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

    let (mut plugin_status, mut plugin_headers, plugin_body) =
        match plugin.runtime.call("handle", plugin_input, js_body, plugin.timeout).await {
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
            hook.runtime.as_ref(),
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
            hook.runtime.as_ref(),
            &hook.function,
            input_json,
            js_body,
            hook.timeout,
        )
        .await
        {
            Ok((
                InterceptorOutput::Continue {
                    status, headers, ..
                },
                body_out,
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

    Ok(true)
}
