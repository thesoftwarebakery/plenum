use std::error::Error;
use std::time::Duration;

use crate::interceptor::InterceptorOutput;
use bytes::Bytes;
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

/// Convert a JsBody back to raw bytes for forwarding.
pub(crate) fn js_body_to_bytes(body: JsBody) -> Bytes {
    match body {
        JsBody::Json(v) => Bytes::from(serde_json::to_vec(&v).unwrap_or_default()),
        JsBody::Text(s) => Bytes::from(s.into_bytes()),
        JsBody::Bytes(b) => Bytes::from(b),
    }
}
