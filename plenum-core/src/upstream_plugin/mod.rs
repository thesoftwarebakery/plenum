use std::collections::HashMap;

use crate::ctx::GatewayCtx;
use crate::gateway_error::GatewayErrorResponse;
use crate::headers::{apply_header_modifications, headers_hashmap_to_http_headermap};
use crate::interceptor::{
    InterceptorOutput, header_map_to_hash_map, request_input_from_parts, response_input_from_parts,
};
use crate::path_match::{OperationSchemas, PluginHandle};
use crate::proxy_utils::{
    call_interceptor, js_body_from_content_type, js_body_to_bytes, merge_ctx, merge_options,
};
use plenum_config::ConfigValue;

use crate::request_context::{ExtractionCtx, PingoraRequest};
use pingora_proxy::Session;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use ts_rs::TS;

/// The request sub-object inside [`PluginInput`].
/// Note: the request body is injected at the top level of the input by the JS
/// runtime and is accessible as `input.body` in JavaScript.
#[derive(Serialize, TS)]
pub struct PluginRequest {
    pub method: String,
    /// The matched OpenAPI path template, e.g. `/users/{id}`.
    pub route: String,
    pub path: String,
    /// Raw query string. Preserved for backward compatibility.
    pub query: String,
    /// Query parameters parsed according to the operation's OpenAPI parameter definitions.
    /// Scalar values are type-coerced; arrays and objects follow the OAS style/explode rules.
    /// Parameters not declared in the spec are included as raw strings.
    #[serde(rename = "queryParams")]
    #[ts(rename = "queryParams", type = "Record<string, unknown>")]
    pub query_params: serde_json::Value,
    pub headers: HashMap<String, String>,
    #[ts(type = "Record<string, unknown>")]
    pub params: HashMap<String, serde_json::Value>,
}

/// Input passed to a plugin's `handle()` function.
#[derive(Serialize, TS)]
pub struct PluginInput {
    pub request: PluginRequest,
    #[ts(type = "unknown")]
    pub config: serde_json::Value,
    #[ts(type = "unknown")]
    pub operation: serde_json::Value,
    #[ts(type = "Ctx")]
    pub ctx: serde_json::Value,
}

/// Output returned by a plugin's `handle()` function.
/// The response body is extracted separately by the JS runtime.
#[derive(Deserialize, Default, TS)]
pub struct PluginOutput {
    #[ts(optional)]
    pub status: Option<u16>,
    /// Headers to set on the response. A `null` value removes the header.
    #[ts(optional)]
    pub headers: Option<HashMap<String, Option<String>>>,
    #[ts(optional, type = "Record<string, unknown>")]
    pub ctx: Option<serde_json::Map<String, serde_json::Value>>,
}

/// The actual shape of the input object that JS plugin `handle()` receives.
/// Includes runtime-injected body fields not present on the base [`PluginInput`].
///
/// Used only for TypeScript type generation — never instantiated at runtime.
#[derive(Serialize, TS)]
#[ts(rename = "PluginInput")]
pub struct JsPluginInput {
    #[serde(flatten)]
    #[ts(flatten)]
    base: PluginInput,
    /// The parsed request body, injected by the JS runtime.
    #[ts(optional, type = "unknown")]
    body: Option<serde_json::Value>,
    /// Set to `"base64"` when `body` is a base64-encoded binary.
    #[serde(rename = "bodyEncoding")]
    #[ts(optional)]
    body_encoding: Option<String>,
}

/// Handle a plugin route request end-to-end:
/// reads the request body, runs interceptors, calls the plugin handle(), runs response
/// interceptors, and writes the response to the downstream session.
/// Returns `Ok(true)` — the Pingora pipeline is short-circuited.
pub(crate) async fn dispatch(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
    plugin: &PluginHandle,
    backend_config: Option<ConfigValue>,
) -> pingora_core::Result<bool> {
    let route = ctx
        .matched_route
        .as_ref()
        .map(|r| r.path.as_str())
        .unwrap_or("")
        .to_string();
    let method = session.req_header().method.to_string();

    // Read the full request body, enforcing the per-operation size limit.
    let buf = match crate::proxy_utils::read_request_body(
        session,
        ctx,
        op.max_request_body_bytes as usize,
    )
    .await?
    {
        Some(b) => b,
        None => return Ok(true),
    };

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
                &route,
                ctx.rate_limit_state.clone(),
                serde_json::Value::Object(ctx.user_ctx.clone()),
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
                Ok((
                    InterceptorOutput::Continue {
                        ctx: returned_ctx, ..
                    },
                    body_out,
                )) => {
                    current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
                    merge_ctx(&mut ctx.user_ctx, returned_ctx);
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
                    crate::phases::gateway_error::respond(
                        session,
                        ctx,
                        GatewayErrorResponse::internal(format!("interceptor error: {}", e)),
                        ctx.error_hook.clone().as_deref(),
                    )
                    .await;
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
            &route,
            ctx.rate_limit_state.clone(),
            serde_json::Value::Object(ctx.user_ctx.clone()),
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
            Ok((
                InterceptorOutput::Continue {
                    headers,
                    ctx: returned_ctx,
                    ..
                },
                _,
            )) => {
                if let Some(mods) = headers {
                    apply_header_modifications(&mut request_headers, &mods);
                }
                merge_ctx(&mut ctx.user_ctx, returned_ctx);
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
                crate::phases::gateway_error::respond(
                    session,
                    ctx,
                    GatewayErrorResponse::internal(format!("interceptor error: {}", e)),
                    ctx.error_hook.clone().as_deref(),
                )
                .await;
                return Ok(true);
            }
        }
    }

    // Step B: call plugin handle()
    let plugin_query_str = session.req_header().uri.query().unwrap_or("");
    let plugin_query_defs = oas_query::extract_query_params(&op.operation_meta);
    let plugin_query_params = serde_json::Value::Object(oas_query::parse_query_params(
        plugin_query_str,
        &plugin_query_defs,
    ));

    // Resolve ${{...}} tokens in backend config using the canonical
    // request_context machinery — compiled at boot, cheap at request time.
    let body_json: Option<serde_json::Value> = serde_json::from_slice(&final_buf).ok();
    let cx = ExtractionCtx {
        req: &PingoraRequest(session.req_header()),
        path_params: &ctx.path_params,
        user_ctx: Some(&ctx.user_ctx),
        peer_addr: None,
        query_params: if let serde_json::Value::Object(ref m) = plugin_query_params {
            Some(m)
        } else {
            None
        },
        body_json: body_json.as_ref(),
    };
    let resolved_config = match &backend_config {
        Some(config) => config.resolve(&cx),
        None => serde_json::Value::Null,
    };

    let plugin_input = PluginInput {
        request: PluginRequest {
            method: session.req_header().method.to_string(),
            route: route.clone(),
            path: session.req_header().uri.path().to_string(),
            query: plugin_query_str.to_string(),
            query_params: plugin_query_params,
            headers: header_map_to_hash_map(&request_headers),
            params: ctx.path_params.clone(),
        },
        config: resolved_config,
        operation: op.operation_meta.clone(),
        ctx: serde_json::Value::Object(ctx.user_ctx.clone()),
    };
    let js_body = js_body_from_content_type(
        session
            .req_header()
            .headers
            .get(http::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        &final_buf,
    );

    let (mut plugin_status, mut plugin_headers, plugin_body, plugin_returned_ctx) = match plugin
        .runtime
        .call(
            "handle",
            serde_json::to_value(plugin_input).unwrap(),
            js_body,
            plugin.timeout,
        )
        .await
    {
        Ok(output) => {
            let parsed: PluginOutput = serde_json::from_value(output.value).unwrap_or_default();
            (
                parsed.status.unwrap_or(200),
                parsed.headers.unwrap_or_default(),
                output.body,
                parsed.ctx,
            )
        }
        Err(e) => {
            log::error!("plugin handle() error: {}", e);
            crate::phases::gateway_error::respond(
                session,
                ctx,
                GatewayErrorResponse::internal(format!("plugin error: {}", e)),
                ctx.error_hook.clone().as_deref(),
            )
            .await;
            return Ok(true);
        }
    };
    merge_ctx(&mut ctx.user_ctx, plugin_returned_ctx);

    // Step C: on_response interceptors
    for hook in &op.interceptors.on_response {
        let effective_headers: HashMap<String, String> = plugin_headers
            .iter()
            .filter_map(|(k, v)| v.as_ref().map(|val| (k.clone(), val.clone())))
            .collect();
        let input = response_input_from_parts(
            http::StatusCode::from_u16(plugin_status).unwrap_or(http::StatusCode::OK),
            &method,
            &route,
            &headers_hashmap_to_http_headermap(&effective_headers),
            op.operation_meta.clone(),
            ctx.rate_limit_state.clone(),
            serde_json::Value::Object(ctx.user_ctx.clone()),
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
                    status,
                    headers,
                    ctx: returned_ctx,
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
                                plugin_headers.insert(k, Some(val));
                            }
                            None => {
                                plugin_headers.remove(&k);
                            }
                        }
                    }
                }
                merge_ctx(&mut ctx.user_ctx, returned_ctx);
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
    let response_content_type = plugin_headers
        .get("content-type")
        .and_then(|v| v.clone())
        .clone();
    for hook in &op.interceptors.on_response_body {
        let js_body =
            js_body_from_content_type(response_content_type.as_deref(), &response_body_bytes);
        let effective_headers: HashMap<String, String> = plugin_headers
            .iter()
            .filter_map(|(k, v)| v.as_ref().map(|val| (k.clone(), val.clone())))
            .collect();
        let input = response_input_from_parts(
            http::StatusCode::from_u16(plugin_status).unwrap_or(http::StatusCode::OK),
            &method,
            &route,
            &headers_hashmap_to_http_headermap(&effective_headers),
            op.operation_meta.clone(),
            ctx.rate_limit_state.clone(),
            serde_json::Value::Object(ctx.user_ctx.clone()),
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
                    status,
                    headers,
                    ctx: returned_ctx,
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
                                plugin_headers.insert(k, Some(val));
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
                merge_ctx(&mut ctx.user_ctx, returned_ctx);
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
    let response_headers: Vec<(String, String)> = plugin_headers
        .into_iter()
        .filter_map(|(k, v)| v.map(|val| (k, val)))
        .collect();
    crate::proxy_utils::write_response(
        session,
        plugin_status,
        &response_headers,
        response_body_bytes,
    )
    .await?;

    Ok(true)
}
