use deno_core::{OpState, extension, op2};
use deno_error::JsErrorBox;

use crate::permissions::InterceptorPermissions;

/// Response from an outbound HTTP fetch.
#[derive(serde::Serialize)]
pub struct FetchResponse {
    pub status: u16,
    pub body: String,
    pub headers: std::collections::HashMap<String, String>,
}

/// Read an environment variable. Requires the variable name to be in the
/// interceptor's allowed_env_vars set.
/// Returns the value as a string, or undefined if the variable is not set.
#[op2]
#[string]
fn op_read_env(state: &mut OpState, #[string] key: String) -> Result<Option<String>, JsErrorBox> {
    let perms = state.borrow::<InterceptorPermissions>();
    perms.check_env(&key).map_err(JsErrorBox::generic)?;
    Ok(std::env::var(&key).ok())
}

/// Read a file from the filesystem. The path must be under one of the
/// interceptor's allowed_read_paths.
#[op2]
#[string]
fn op_read_file(state: &mut OpState, #[string] path: String) -> Result<String, JsErrorBox> {
    let perms = state.borrow::<InterceptorPermissions>();
    let p = std::path::Path::new(&path);
    perms.check_read(p).map_err(JsErrorBox::generic)?;
    std::fs::read_to_string(p).map_err(|e| JsErrorBox::generic(format!("read_file failed: {e}")))
}

/// Make an outbound HTTP request. The hostname must be in the interceptor's
/// allowed_hosts set.
#[op2]
#[serde]
fn op_fetch(
    state: &mut OpState,
    #[string] url: String,
    #[string] method: String,
    #[string] body: String,
) -> Result<FetchResponse, JsErrorBox> {
    // Extract hostname for the permission check.
    let parsed =
        url::Url::parse(&url).map_err(|e| JsErrorBox::generic(format!("invalid URL: {e}")))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| JsErrorBox::generic("URL has no host".to_string()))?
        .to_string();

    {
        let perms = state.borrow::<InterceptorPermissions>();
        perms.check_net(&host).map_err(JsErrorBox::generic)?;
    } // borrow released before network I/O

    // Build an http::Request with the given method, then run it via ureq.
    let http_method = ureq::http::Method::from_bytes(method.as_bytes())
        .map_err(|e| JsErrorBox::generic(format!("invalid HTTP method: {e}")))?;

    let request = ureq::http::Request::builder()
        .method(http_method)
        .uri(&url)
        .body(body.into_bytes())
        .map_err(|e| JsErrorBox::generic(format!("failed to build request: {e}")))?;

    let mut response =
        ureq::run(request).map_err(|e| JsErrorBox::generic(format!("fetch failed: {e}")))?;

    let status = response.status().as_u16();
    let mut headers = std::collections::HashMap::new();
    for (key, val) in response.headers() {
        if let Ok(val_str) = val.to_str() {
            headers.insert(key.to_string(), val_str.to_string());
        }
    }
    let body_str = response
        .body_mut()
        .read_to_string()
        .map_err(|e| JsErrorBox::generic(format!("failed to read response body: {e}")))?;

    Ok(FetchResponse {
        status,
        body: body_str,
        headers,
    })
}

extension!(
    opengateway_runtime_ext,
    ops = [op_read_env, op_read_file, op_fetch],
    js = ["src/runtime_api.js"],
);
