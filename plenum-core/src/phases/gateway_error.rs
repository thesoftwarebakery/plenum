use bytes::Bytes;
use pingora_proxy::Session;
use tracing::Instrument;

use crate::ctx::GatewayCtx;
use crate::gateway_error::GatewayErrorResponse;
use crate::interceptor::{InterceptorOutput, gateway_error_input_from_parts};
use crate::path_match::HookHandle;
use crate::proxy_utils::{call_interceptor, merge_options, write_response};

/// Central gateway error response codepath.
///
/// All gateway-originated errors flow through this function. If an
/// `on_gateway_error` interceptor is configured, it is called before the
/// response is written. The interceptor can modify the status, headers, and body.
///
/// If the interceptor itself errors, both the original error and the handler
/// error are logged, and a hard 500 is returned to the client.
pub(crate) async fn respond(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    mut error: GatewayErrorResponse,
    error_hook: Option<&HookHandle>,
) {
    if let Some(hook) = error_hook {
        let method = session.req_header().method.as_str().to_string();
        let path = session.req_header().uri.path().to_string();
        let route = ctx
            .matched_route
            .as_ref()
            .map(|r| r.path.as_str())
            .unwrap_or("");

        let input = gateway_error_input_from_parts(
            &method,
            &path,
            route,
            &session.req_header().headers,
            error.error_code,
            &error.error_message,
            error.status,
            serde_json::Value::Object(ctx.user_ctx.clone()),
        );
        let mut input_json = serde_json::to_value(&input).unwrap();
        merge_options(&mut input_json, hook.options.as_ref());

        let span = tracing::debug_span!(
            "interceptor_call",
            hook = "on_gateway_error",
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
                body_out,
            )) => {
                if let Some(code) = status {
                    error.status = code;
                }
                if let Some(mods) = headers {
                    // Build response headers from modifications.
                    // For gateway errors we start with no headers, so only
                    // non-null values are added.
                    let mut header_pairs: Vec<(String, String)> = Vec::new();
                    for (k, v) in mods {
                        if let Some(val) = v {
                            header_pairs.push((k, val));
                        }
                    }
                    if !header_pairs.is_empty() {
                        write_response(
                            session,
                            error.status,
                            &header_pairs,
                            body_out
                                .map(crate::proxy_utils::js_body_to_bytes)
                                .unwrap_or(error.body),
                        )
                        .await
                        .ok();
                        return;
                    }
                }
                if let Some(b) = body_out {
                    error.body = crate::proxy_utils::js_body_to_bytes(b);
                }
            }
            Ok((InterceptorOutput::Respond { .. }, _)) => {
                log::warn!(
                    "on_gateway_error interceptor returned 'respond' -- ignoring (use 'continue' to modify error responses)"
                );
            }
            Err(e) => {
                log::error!(
                    "on_gateway_error interceptor error (original error: {} {}): {}",
                    error.status,
                    error.error_message,
                    e
                );
                // Hard 500 — broken error handler is a system error.
                session
                    .respond_error_with_body(
                        500,
                        Bytes::from(
                            serde_json::json!({"error": "internal server error"}).to_string(),
                        ),
                    )
                    .await
                    .ok();
                return;
            }
        }
    }

    if error.headers.is_empty() {
        session
            .respond_error_with_body(error.status, error.body)
            .await
            .ok();
    } else {
        // Use write_response when extra headers are needed (e.g. Allow for 405).
        write_response(session, error.status, &error.headers, error.body)
            .await
            .ok();
    }
}
