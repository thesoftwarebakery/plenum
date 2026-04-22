use bytes::{BufMut, Bytes};
use pingora_proxy::Session;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::effective_timeout;
use crate::gateway_error::GatewayError;
use crate::headers::apply_header_modifications;
use crate::interceptor::{InterceptorOutput, request_input_from_parts};
use crate::path_match::OperationSchemas;
use crate::proxy_utils::{
    build_call_ctx, call_interceptor, js_body_from_content_type, js_body_to_bytes, merge_ctx,
    merge_options,
};
use crate::request_timeout;

/// Run on_request phase 1 interceptors (headers only, null body).
/// Returns `Ok(true)` if the request was short-circuited (respond or error).
///
/// When `budget_cap` is true, each interceptor call is capped to the remaining
/// request budget and the cancellation token is checked before each call.
/// When false (plugin routes inside a timeout wrapper), interceptors use their
/// own per-interceptor timeout and no budget check is performed.
pub(crate) async fn run_phase1(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
    budget_cap: bool,
) -> pingora_core::Result<bool> {
    let route = ctx
        .matched_route
        .as_ref()
        .map(|r| r.path.clone())
        .unwrap_or_default();
    let method = session.req_header().method.to_string();

    for hook in &op.interceptors.on_request {
        let timeout = if budget_cap {
            let t = effective_timeout(ctx, op, hook);
            if ctx.cancellation.is_cancelled() {
                session
                    .respond_error_with_body(
                        504,
                        GatewayError::gateway_timeout("request timeout exceeded").body(),
                    )
                    .await
                    .ok();
                return Ok(true);
            }
            t
        } else {
            hook.timeout
        };

        let call_ctx = build_call_ctx(&ctx.user_ctx, &route, &method);
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &session.req_header().headers,
            ctx.path_params.clone(),
            op.operation_meta.clone(),
            call_ctx,
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
            timeout,
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
                    apply_header_modifications(session.req_header_mut(), &mods);
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
                // If budget is exhausted, this was a timeout — return 504.
                if ctx.request_start.is_some_and(|start| {
                    request_timeout::remaining_budget(start, op.request_timeout).is_none()
                }) {
                    ctx.cancellation.cancel();
                    session
                        .respond_error_with_body(
                            504,
                            GatewayError::gateway_timeout("request timeout exceeded").body(),
                        )
                        .await
                        .ok();
                } else {
                    log::error!("on_request interceptor error: {}", e);
                    session
                        .respond_error_with_body(
                            500,
                            GatewayError::internal(format!("interceptor error: {}", e)).body(),
                        )
                        .await
                        .ok();
                }
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Run on_request phase 2 interceptors (with body access).
/// Returns the final body buffer after all interceptors have run, or `None`
/// if the request was short-circuited (in which case `ctx.filter_responded` is set).
pub(crate) async fn run_phase2_body(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
    buf: Bytes,
) -> pingora_core::Result<Option<Bytes>> {
    if op.interceptors.on_request.is_empty() || buf.is_empty() {
        return Ok(Some(buf));
    }

    let content_type = session
        .req_header()
        .headers
        .get(http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let mut current_buf = buf;

    let route = ctx
        .matched_route
        .as_ref()
        .map(|r| r.path.clone())
        .unwrap_or_default();
    let method = session.req_header().method.to_string();

    for hook in &op.interceptors.on_request {
        let timeout = effective_timeout(ctx, op, hook);
        if ctx.cancellation.is_cancelled() {
            session
                .respond_error_with_body(
                    504,
                    GatewayError::gateway_timeout("request timeout exceeded").body(),
                )
                .await
                .ok();
            ctx.filter_responded = true;
            return Ok(None);
        }

        let js_body = js_body_from_content_type(content_type.as_deref(), &current_buf);
        let call_ctx = build_call_ctx(&ctx.user_ctx, &route, &method);
        let input = request_input_from_parts(
            &session.req_header().method,
            &session.req_header().uri,
            &session.req_header().headers,
            ctx.path_params.clone(),
            op.operation_meta.clone(),
            call_ctx,
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
            timeout,
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
                ctx.filter_responded = true;
                return Ok(None);
            }
            Err(e) => {
                if ctx.request_start.is_some_and(|start| {
                    request_timeout::remaining_budget(start, op.request_timeout).is_none()
                }) {
                    ctx.cancellation.cancel();
                    session
                        .respond_error_with_body(
                            504,
                            GatewayError::gateway_timeout("request timeout exceeded").body(),
                        )
                        .await
                        .ok();
                } else {
                    log::error!("on_request interceptor error: {}", e);
                    session
                        .respond_error_with_body(
                            500,
                            GatewayError::internal(format!("interceptor error: {}", e)).body(),
                        )
                        .await
                        .ok();
                }
                ctx.filter_responded = true;
                return Ok(None);
            }
        }
    }
    Ok(Some(current_buf))
}

/// Run the request body filter phase:
/// 1. Enforce the per-operation body size limit on every chunk, before any interceptor runs.
/// 2. Buffer chunks and run on_request phase-2 interceptors when configured.
///
/// Returns `Ok(true)` if a response was already written (413 or interceptor short-circuit),
/// meaning no further processing should occur for this request.
pub(crate) async fn run_body_filter(
    session: &mut Session,
    body: &mut Option<Bytes>,
    end_of_stream: bool,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
) -> pingora_core::Result<bool> {
    // 1. Body size enforcement — runs on every chunk, regardless of interceptors.
    if let Some(b) = body {
        let new_total = ctx.request_body_bytes_received + b.len();
        if new_total > op.max_request_body_bytes as usize {
            b.clear();
            session
                .respond_error_with_body(
                    413,
                    GatewayError::payload_too_large("request body too large").body(),
                )
                .await
                .ok();
            ctx.filter_responded = true;
            return Ok(true);
        }
        ctx.request_body_bytes_received = new_total;
    }

    // 2. Interceptor buffering — only when on_request interceptors are configured.
    if op.interceptors.on_request.is_empty() {
        return Ok(false);
    }

    if let Some(b) = body {
        ctx.request_body_buf.put(b.as_ref());
        b.clear();
    }

    if end_of_stream {
        let buf = ctx.request_body_buf.split().freeze();
        match run_phase2_body(session, ctx, op, buf).await? {
            Some(final_buf) => {
                if !final_buf.is_empty() {
                    *body = Some(final_buf);
                }
            }
            None => return Ok(true), // short-circuited (filter_responded already set)
        }
    }

    Ok(false)
}
