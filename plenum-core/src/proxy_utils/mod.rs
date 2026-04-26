use std::error::Error;
use std::time::Duration;

use crate::gateway_error::GatewayError;
use crate::interceptor::InterceptorOutput;
use bytes::{BufMut, Bytes, BytesMut};
use pingora_proxy::Session;
use plenum_js_runtime::{JsBody, PluginRuntime};

/// Call a JS interceptor and deserialize the output.
/// Returns the deserialized InterceptorOutput and any modified body.
pub(crate) async fn call_interceptor(
    handle: &dyn PluginRuntime,
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
pub(crate) fn call_interceptor_blocking(
    handle: &dyn PluginRuntime,
    function_name: &str,
    input: serde_json::Value,
    body: Option<JsBody>,
    timeout: Duration,
) -> Result<(InterceptorOutput, Option<JsBody>), Box<dyn Error + Send + Sync>> {
    let result = handle.call_blocking(function_name, input, body, timeout)?;
    let output: InterceptorOutput = serde_json::from_value(result.value)?;
    Ok((output, result.body))
}

/// Shallow-merge a ctx object returned by an interceptor or plugin into the user ctx bag.
///
/// Top-level keys from `returned` overwrite existing keys; keys absent from `returned`
/// are preserved.
pub(crate) fn merge_ctx(
    user_ctx: &mut serde_json::Map<String, serde_json::Value>,
    returned: Option<serde_json::Map<String, serde_json::Value>>,
) {
    let Some(returned) = returned else { return };
    for (k, v) in returned {
        user_ctx.insert(k, v);
    }
}

/// Helper to merge interceptor options into the input JSON value.
pub(crate) fn merge_options(
    input_json: &mut serde_json::Value,
    options: Option<&serde_json::Value>,
) {
    if let (Some(opts), serde_json::Value::Object(map)) = (options, input_json) {
        map.insert("options".to_string(), opts.clone());
    }
}

/// Determine the JS body representation for a buffer based on the request content-type.
/// Returns None if the buffer is empty.
pub(crate) fn js_body_from_content_type(content_type: Option<&str>, buf: &[u8]) -> Option<JsBody> {
    if buf.is_empty() {
        return None;
    }
    match content_type {
        Some(ct) if ct.starts_with("application/json") => match serde_json::from_slice(buf) {
            Ok(v) => Some(JsBody::Json(v)),
            // Malformed JSON is still text — pass as-is so interceptors (e.g.
            // validate-request) can inspect it and return a meaningful 400.
            Err(_) => Some(JsBody::Text(String::from_utf8_lossy(buf).into_owned())),
        },
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

/// Read the full request body from the downstream session, enforcing a size limit.
/// Returns `Ok(Some(bytes))` on success, or `Ok(None)` after responding with 413
/// if the body exceeds `max_bytes`.
pub(crate) async fn read_request_body(
    session: &mut Session,
    max_bytes: usize,
) -> pingora_core::Result<Option<Bytes>> {
    let mut body_bytes = BytesMut::new();
    loop {
        match session.downstream_session.read_request_body().await {
            Ok(Some(chunk)) => {
                if body_bytes.len() + chunk.len() > max_bytes {
                    session
                        .respond_error_with_body(
                            413,
                            GatewayError::payload_too_large("request body too large").body(),
                        )
                        .await
                        .ok();
                    return Ok(None);
                }
                body_bytes.put(chunk.as_ref());
            }
            Ok(None) => break,
            Err(e) => {
                log::error!("error reading request body: {}", e);
                session
                    .respond_error_with_body(
                        500,
                        GatewayError::internal(format!("error reading request body: {e}")).body(),
                    )
                    .await
                    .ok();
                return Ok(None);
            }
        }
    }
    Ok(Some(body_bytes.freeze()))
}

/// Convert a JsBody back to raw bytes for forwarding.
pub(crate) fn js_body_to_bytes(body: JsBody) -> Bytes {
    match body {
        JsBody::Json(v) => Bytes::from(serde_json::to_vec(&v).unwrap_or_default()),
        JsBody::Text(s) => Bytes::from(s.into_bytes()),
        JsBody::Bytes(b) => Bytes::from(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_ctx_shallow_merges_keys() {
        let mut user_ctx = serde_json::Map::new();
        user_ctx.insert("a".to_string(), json!(1));
        user_ctx.insert("b".to_string(), json!(2));

        let mut returned = serde_json::Map::new();
        returned.insert("b".to_string(), json!(99));
        returned.insert("c".to_string(), json!(3));

        merge_ctx(&mut user_ctx, Some(returned));

        assert_eq!(user_ctx["a"], json!(1)); // preserved
        assert_eq!(user_ctx["b"], json!(99)); // overwritten
        assert_eq!(user_ctx["c"], json!(3)); // added
    }

    #[test]
    fn merge_ctx_none_is_noop() {
        let mut user_ctx = serde_json::Map::new();
        user_ctx.insert("x".to_string(), json!(42));

        merge_ctx(&mut user_ctx, None);

        assert_eq!(user_ctx["x"], json!(42));
    }
}
