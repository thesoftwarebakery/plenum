use bytes::Bytes;
use pingora_http::ResponseHeader;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::effective_timeout;
use crate::headers::apply_header_modifications;
use crate::interceptor::{InterceptorOutput, response_input_from_parts};
use crate::path_match::OperationSchemas;
use crate::proxy_utils::{
    call_interceptor, call_interceptor_blocking, js_body_from_content_type, js_body_to_bytes,
    merge_options,
};

/// Run on_response interceptors with budget-capped timeouts.
/// Response headers are already in flight — on cancellation, log and break.
pub(crate) async fn run(
    upstream_response: &mut ResponseHeader,
    ctx: &GatewayCtx,
    op: &OperationSchemas,
) -> pingora_core::Result<()> {
    for hook in &op.interceptors.on_response {
        let timeout = effective_timeout(ctx, op, hook);
        if ctx.cancellation.is_cancelled() {
            log::warn!("request timeout exceeded during on_response interceptors");
            break;
        }

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
            hook.runtime.as_ref(),
            &hook.function,
            input_json,
            None,
            timeout,
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

    Ok(())
}

/// Run on_response_body interceptors (synchronous, called from block_in_place).
/// Response is already committed — on cancellation, log and break.
/// Returns the final body buffer after all interceptors have run.
pub(crate) fn run_body(
    ctx: &GatewayCtx,
    op: &OperationSchemas,
    buf: Bytes,
    status: http::StatusCode,
) -> Bytes {
    let mut current_buf = buf;
    for hook in &op.interceptors.on_response_body {
        let timeout = effective_timeout(ctx, op, hook);
        if ctx.cancellation.is_cancelled() {
            log::warn!("request timeout exceeded during on_response_body interceptors");
            break;
        }

        let js_body =
            js_body_from_content_type(ctx.upstream_response_content_type.as_deref(), &current_buf);
        let input =
            response_input_from_parts(status, &http::HeaderMap::new(), op.operation_meta.clone());
        let mut input_json = serde_json::to_value(&input).unwrap();
        merge_options(&mut input_json, hook.options.as_ref());

        let _span = tracing::debug_span!(
            "interceptor_call",
            hook = "on_response_body",
            function = hook.function.as_str()
        )
        .entered();
        match call_interceptor_blocking(
            hook.runtime.as_ref(),
            &hook.function,
            input_json,
            js_body,
            timeout,
        ) {
            Ok((InterceptorOutput::Continue { .. }, body_out)) => {
                current_buf = body_out.map(js_body_to_bytes).unwrap_or(current_buf);
            }
            Ok((InterceptorOutput::Respond { .. }, _)) => {
                log::warn!("on_response_body interceptor returned 'respond' -- ignoring");
            }
            Err(e) => {
                log::error!("on_response_body interceptor error: {}", e);
            }
        }
    }
    current_buf
}
