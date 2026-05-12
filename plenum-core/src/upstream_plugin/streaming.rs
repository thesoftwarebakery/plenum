use bytes::Bytes;
use plenum_js_runtime::StreamChunk;

use crate::ctx::GatewayCtx;
use crate::gateway_error::GatewayErrorResponse;
use crate::path_match::OperationSchemas;
use crate::proxy_utils::merge_ctx;
use crate::upstream::PluginHandle;
use pingora_proxy::Session;
use plenum_js_runtime::JsBody;

use super::types::PluginOutput;
use super::{flatten_plugin_headers, run_on_response_interceptors};

/// Handle a streaming plugin route: calls `call_stream()`, runs `on_response`
/// interceptors, and writes chunked response data to the downstream session.
#[allow(clippy::too_many_arguments)]
pub(super) async fn dispatch_streaming(
    session: &mut Session,
    ctx: &mut GatewayCtx,
    op: &OperationSchemas,
    plugin: &PluginHandle,
    plugin_input: super::types::PluginInput,
    js_body: Option<JsBody>,
    method: &str,
    route: &str,
) -> pingora_core::Result<bool> {
    let (meta_value, mut rx) = match plugin
        .runtime
        .call_stream(
            "handle",
            serde_json::to_value(plugin_input).unwrap(),
            js_body,
            plugin.timeout,
        )
        .await
    {
        Ok(result) => result,
        Err(e) => {
            plugin_error_response!(session, ctx, "plugin handle() streaming error", e);
        }
    };

    let parsed: PluginOutput = serde_json::from_value(meta_value.value).unwrap_or_default();
    let mut plugin_status = parsed.status.unwrap_or(200);
    let mut plugin_headers = parsed.headers.unwrap_or_default();
    merge_ctx(&mut ctx.user_ctx, parsed.ctx);

    // Run on_response interceptors (they don't access the body).
    run_on_response_interceptors(
        op,
        ctx,
        method,
        route,
        &mut plugin_status,
        &mut plugin_headers,
    )
    .await;

    // on_response_body interceptors are SKIPPED for streaming routes.
    // Streaming has no full body buffer for interceptors to transform.
    // Plugin author accepts this tradeoff when setting `streaming: true`.
    if !op.interceptors.on_response_body.is_empty() {
        log::warn!(
            "on_response_body interceptors are not supported for streaming plugin route '{}' — skipped",
            route,
        );
    }

    // Write response header then stream chunks.
    let response_headers = flatten_plugin_headers(plugin_headers);
    let mut resp_header =
        pingora_http::ResponseHeader::build(plugin_status, None).map_err(|e| {
            pingora_core::Error::because(
                pingora_core::ErrorType::InternalError,
                "build response header for streaming plugin",
                e,
            )
        })?;
    for (name, value) in &response_headers {
        resp_header
            .insert_header(name.clone(), value.as_bytes())
            .ok();
    }
    session
        .write_response_header(Box::new(resp_header), false)
        .await
        .map_err(|e| {
            pingora_core::Error::because(
                pingora_core::ErrorType::InternalError,
                "write response header for streaming plugin",
                e,
            )
        })?;

    // Stream chunks until done or client disconnect.
    loop {
        tokio::select! {
            biased;
            _ = ctx.cancellation.cancelled() => {
                break;
            }
            chunk = rx.recv() => {
                match chunk {
                    Some(Ok(StreamChunk::Chunk(data))) => {
                        session
                            .write_response_body(Some(Bytes::from(data)), false)
                            .await
                            .map_err(|e| {
                                pingora_core::Error::because(
                                    pingora_core::ErrorType::InternalError,
                                    "write streaming plugin chunk",
                                    e,
                                )
                            })?;
                    }
                    Some(Ok(StreamChunk::Done)) | None => {
                        session
                            .write_response_body(None, true)
                            .await
                            .map_err(|e| {
                                pingora_core::Error::because(
                                    pingora_core::ErrorType::InternalError,
                                    "finalize streaming plugin response",
                                    e,
                                )
                            })?;
                        break;
                    }
                    Some(Err(e)) => {
                        log::error!("plugin streaming error: {}", e);
                        let _ = session.write_response_body(None, true).await;
                        break;
                    }
                }
            }
        }
    }

    Ok(true)
}
