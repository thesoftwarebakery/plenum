use pingora_http::RequestHeader;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::effective_timeout;
use crate::headers::apply_header_modifications;
use crate::interceptor::{InterceptorOutput, request_input_from_parts};
use crate::path_match::OperationSchemas;
use crate::proxy_utils::{build_call_ctx, call_interceptor, merge_ctx, merge_options};

/// Prepare upstream request headers and run before_upstream interceptors.
///
/// Adjusts Content-Length/Transfer-Encoding when on_request interceptors may have
/// modified the body, and strips accept-encoding when on_response_body interceptors
/// need raw bytes. Then runs before_upstream interceptors with budget-capped timeouts.
pub(crate) async fn run(
    upstream_request: &mut RequestHeader,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
) -> pingora_core::Result<()> {
    // When on_request is configured, the body may be modified in request_body_filter.
    // Replace Content-Length with Transfer-Encoding: chunked so pingora will stream
    // the (possibly resized) body to the upstream without a fixed length constraint.
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

    let route = ctx
        .matched_route
        .as_ref()
        .map(|r| r.path.clone())
        .unwrap_or_default();
    let method = upstream_request.method.to_string();

    for hook in &op.interceptors.before_upstream {
        let timeout = effective_timeout(ctx, op, hook);
        if ctx.cancellation.is_cancelled() {
            log::warn!("request timeout exceeded during before_upstream interceptors");
            break;
        }

        let call_ctx = build_call_ctx(&ctx.user_ctx, &route, &method);
        let input = request_input_from_parts(
            &upstream_request.method,
            &upstream_request.uri,
            &upstream_request.headers,
            ctx.path_params.clone(),
            op.operation_meta.clone(),
            call_ctx,
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
            timeout,
        )
        .instrument(span)
        .await
        {
            Ok((InterceptorOutput::Continue { headers, ctx: returned_ctx, .. }, _)) => {
                if let Some(mods) = &headers {
                    apply_header_modifications(upstream_request, mods);
                }
                merge_ctx(&mut ctx.user_ctx, returned_ctx);
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
