use pingora_proxy::Session;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::effective_timeout;
use crate::gateway_error::GatewayErrorResponse;
use crate::headers::apply_header_modifications;
use crate::interceptor::{InterceptorOutput, request_input_from_parts};
use crate::path_match::OperationSchemas;
use crate::proxy_utils::{call_interceptor, js_body_to_bytes, merge_ctx, merge_options};
use crate::request_timeout;

/// Run on_request_headers interceptors (headers only, before on_request).
/// Returns `Ok(true)` if the request was short-circuited (respond or error).
///
/// When `budget_cap` is true, each interceptor call is capped to the remaining
/// request budget and the cancellation token is checked before each call.
/// When false (plugin routes inside a timeout wrapper), interceptors use their
/// own per-interceptor timeout and no budget check is performed.
pub(crate) async fn run(
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

    for hook in &op.interceptors.on_request_headers {
        let timeout = if budget_cap {
            let t = effective_timeout(ctx, op, hook);
            if ctx.cancellation.is_cancelled() {
                super::gateway_error::respond(
                    session,
                    ctx,
                    GatewayErrorResponse::gateway_timeout("request timeout exceeded"),
                    ctx.error_hook.clone().as_deref(),
                )
                .await;
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
            &route,
            None, // rate limiting hasn't evaluated yet
            serde_json::Value::Object(ctx.user_ctx.clone()),
        );
        let mut input_json = serde_json::to_value(&input).unwrap();
        merge_options(&mut input_json, hook.options.as_ref());

        let span = tracing::debug_span!(
            "interceptor_call",
            hook = "on_request_headers",
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
            // User-initiated short-circuit — NOT a gateway error.
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
                    super::gateway_error::respond(
                        session,
                        ctx,
                        GatewayErrorResponse::gateway_timeout("request timeout exceeded"),
                        ctx.error_hook.clone().as_deref(),
                    )
                    .await;
                } else {
                    log::error!("on_request_headers interceptor error: {}", e);
                    super::gateway_error::respond(
                        session,
                        ctx,
                        GatewayErrorResponse::internal(format!("interceptor error: {}", e)),
                        ctx.error_hook.clone().as_deref(),
                    )
                    .await;
                }
                return Ok(true);
            }
        }
    }
    Ok(false)
}
