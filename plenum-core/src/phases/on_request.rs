use bytes::Bytes;
use pingora_proxy::Session;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::effective_timeout;
use crate::gateway_error::GatewayError;
use crate::headers::apply_header_modifications;
use crate::interceptor::{InterceptorOutput, request_input_from_parts};
use crate::path_match::OperationSchemas;
use crate::proxy_utils::{
    call_interceptor, js_body_from_content_type, js_body_to_bytes, merge_options,
};

/// Run on_request phase 1 interceptors (headers only, null body).
/// Returns `Ok(true)` if the request was short-circuited (respond or error).
///
/// When `budget_cap` is true, each interceptor call is capped to the remaining
/// request budget and the cancellation token is checked before each call.
/// When false (plugin routes inside a timeout wrapper), interceptors use their
/// own per-interceptor timeout and no budget check is performed.
pub(crate) async fn run_phase1(
    session: &mut Session,
    ctx: &GatewayCtx,
    op: &OperationSchemas,
    budget_cap: bool,
) -> pingora_core::Result<bool> {
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
            timeout,
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
            timeout,
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
                return Ok(None);
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
                ctx.filter_responded = true;
                return Ok(None);
            }
        }
    }
    Ok(Some(current_buf))
}
