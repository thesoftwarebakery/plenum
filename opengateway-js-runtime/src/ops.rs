use deno_core::{OpState, extension, op2};
use deno_error::JsErrorBox;

use crate::permissions::InterceptorPermissions;

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

// Stub extension named "deno_net" that provides ext:deno_net/02_tls.js and
// ext:deno_net/03_quic.js. deno_fetch imports loadTlsKeyPair for custom TLS;
// deno_web's webtransport.js imports QUIC helpers. Neither is used by interceptors.
extension!(
    deno_net,
    esm = [
        "ext:deno_net/02_tls.js" = "src/02_tls.js",
        "ext:deno_net/03_quic.js" = "src/stub_quic.js",
    ],
);

// Stub extension named "deno_telemetry" that provides ext:deno_telemetry/telemetry.ts
// and ext:deno_telemetry/util.ts. deno_fetch's 26_fetch.js imports tracing symbols
// from these modules. With TRACING_ENABLED=false the tracing paths are bypassed
// so all exports beyond that flag are safe no-ops. Must come before deno_fetch.
extension!(
    deno_telemetry,
    esm = [
        "ext:deno_telemetry/telemetry.ts" = "src/stub_telemetry.js",
        "ext:deno_telemetry/util.ts" = "src/stub_telemetry_util.js",
    ],
);

// Stub extension named "deno_node" providing the minimal subset of Node.js compat
// modules referenced at startup by deno_crypto. The kKeyObject symbol only needs to
// be consistent within this runtime; no Node.js interop is required.
extension!(
    deno_node,
    esm = ["ext:deno_node/internal/crypto/constants.ts" = "src/stub_node_crypto_constants.js",],
);

extension!(
    opengateway_runtime_ext,
    deps = [deno_web],
    ops = [op_read_env, op_read_file],
    esm_entry_point = "ext:opengateway_runtime_ext/runtime_entry.js",
    esm = ["ext:opengateway_runtime_ext/runtime_entry.js" = "src/runtime_entry.js"],
    js = ["src/runtime_api.js"],
);
