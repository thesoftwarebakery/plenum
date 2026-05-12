//! Out-of-process plugin runtime communicating over Unix domain sockets.
//!
//! The gateway spawns a Node.js process that listens on a Unix socket.
//! Frames use length-prefixed MessagePack encoding (see `plenum-ipc`).
//!
//! Multiple requests can be in flight concurrently over a single socket;
//! routing is handled by [`plenum_ipc::MultiplexedTransport`].

mod process;
mod streaming;

pub use process::{locate_interceptor, locate_plugin, locate_server_script};

use std::error::Error;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use plenum_ipc::{Frame, MultiplexedTransport, TransportError};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::{CallOutput, InterceptorPermissions, JsBody, JsError, PluginRuntime, StreamReceiver};

use streaming::map_to_stream_receiver;

/// Maximum number of restart attempts before a plugin is considered permanently failed.
const MAX_RESTARTS: u32 = 5;

/// A request sent from the gateway to the external plugin process.
#[derive(Serialize, Deserialize)]
struct PluginRequest {
    id: u64,
    method: String,
    params: serde_json::Value,
}

/// Live connection state — replaced atomically on respawn.
struct RuntimeState {
    transport: MultiplexedTransport,
    child: tokio::process::Child,
    socket_path: PathBuf,
    /// Monotonic counter incremented on every successful respawn. Used to
    /// ensure only one concurrent caller triggers a respawn when the
    /// connection closes.
    generation: u64,
}

/// Handle to an external Node.js plugin process communicating over a Unix domain socket.
pub struct ExternalRuntime {
    /// Live runtime state (replaced on respawn). Held only briefly to clone
    /// the transport; RPC calls run without holding this lock.
    state: Mutex<RuntimeState>,
    next_id: AtomicU64,
    /// Server script path and plugin module path, stored for respawning.
    server_script: PathBuf,
    plugin_path: String,
    socket_dir: PathBuf,
    /// Permissions applied when spawning the process, stored for respawning.
    permissions: InterceptorPermissions,
    /// Options passed to `init()`, stored for re-initialisation after respawn.
    init_options: serde_json::Value,
    /// Tokio runtime that owns the transport when spawned outside an existing runtime.
    _runtime: Option<tokio::runtime::Runtime>,
}

impl Drop for ExternalRuntime {
    fn drop(&mut self) {
        // Best-effort graceful shutdown: SIGTERM then socket cleanup.
        if let Ok(mut state) = self.state.try_lock() {
            let _ = state.child.start_kill();
            let _ = std::fs::remove_file(&state.socket_path);
        }

        // The tokio runtime cannot be dropped from an async context (panics).
        if let Some(rt) = self._runtime.take() {
            std::thread::spawn(move || drop(rt));
        }
    }
}

/// Merge a `JsBody` into a JSON arg under the `"body"` key (and `"bodyEncoding"`
/// for binary), matching the convention used by `call()` and `call_stream()`.
fn merge_body_into_arg(arg: &mut serde_json::Value, body: &JsBody) {
    match body {
        JsBody::Json(v) => {
            if let Some(obj) = arg.as_object_mut() {
                obj.insert("body".to_string(), v.clone());
            }
        }
        JsBody::Text(s) => {
            if let Some(obj) = arg.as_object_mut() {
                obj.insert("body".to_string(), serde_json::Value::String(s.clone()));
            }
        }
        JsBody::Bytes(bytes) => {
            use base64::Engine as _;
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            if let Some(obj) = arg.as_object_mut() {
                obj.insert("body".to_string(), serde_json::Value::String(encoded));
                obj.insert(
                    "bodyEncoding".to_string(),
                    serde_json::Value::String("base64".to_string()),
                );
            }
        }
    }
}

/// Parse a response payload from the plugin into a result value.
///
/// Maps `error` fields to the appropriate [`JsError`] variant and extracts
/// `result` from successful responses.
fn parse_response(payload: serde_json::Value, method: &str) -> Result<serde_json::Value, JsError> {
    if let Some(err) = payload.get("error").and_then(|v| v.as_str()) {
        if err.contains("not found in plugin exports") {
            let name = err
                .strip_prefix("function '")
                .and_then(|s| s.split('\'').next())
                .map(str::to_string)
                .unwrap_or_else(|| method.to_string());
            return Err(JsError::FunctionNotFound(name));
        }
        return Err(JsError::ExecutionError(err.to_string()));
    }

    payload
        .get("result")
        .cloned()
        .ok_or_else(|| JsError::ExecutionError("response has neither result nor error".into()))
}

impl ExternalRuntime {
    /// Send a request and wait for a single response, respawning on connection failure.
    async fn send_recv(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, JsError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let request = PluginRequest {
            id,
            method: method.to_string(),
            params,
        };
        let payload = serde_json::to_value(&request)
            .map_err(|e| JsError::ExecutionError(format!("serialize error: {e}")))?;

        let mut delay_ms = 100u64;
        for attempt in 0..=MAX_RESTARTS {
            let (transport, generation) = {
                let state = self.state.lock().await;
                (state.transport.clone(), state.generation)
            };

            let frame = Frame {
                id,
                payload: payload.clone(),
            };

            match transport.send_recv(frame).await {
                Ok(response_frame) => return parse_response(response_frame.payload, method),
                Err(TransportError::ConnectionClosed) => {
                    if attempt == MAX_RESTARTS {
                        break;
                    }
                    log::warn!(
                        "plugin process for '{}' connection closed (attempt {}/{}), respawning in {}ms",
                        self.plugin_path,
                        attempt + 1,
                        MAX_RESTARTS,
                        delay_ms,
                    );
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    delay_ms = (delay_ms * 2).min(5000);
                    self.respawn_and_reinit_if_needed(generation).await?;
                }
                Err(e) => {
                    return Err(JsError::ExecutionError(format!("transport error: {e}")));
                }
            }
        }

        Err(JsError::ExecutionError(format!(
            "plugin '{}' failed after {} restart attempts",
            self.plugin_path, MAX_RESTARTS
        )))
    }

    /// Respawn the Node.js process and re-run `init` if this generation is
    /// still the dead one. If a concurrent caller already respawned (generation
    /// advanced), this is a no-op.
    async fn respawn_and_reinit_if_needed(&self, dead_generation: u64) -> Result<(), JsError> {
        let mut state = self.state.lock().await;
        if state.generation > dead_generation {
            // Another caller already respawned.
            return Ok(());
        }

        let _ = state.child.start_kill();
        let _ = std::fs::remove_file(&state.socket_path);

        let (new_child, new_stream, new_socket_path) = process::spawn_process(
            &self.server_script,
            &self.plugin_path,
            &self.socket_dir,
            &self.permissions,
        )
        .await
        .map_err(|e| JsError::ExecutionError(format!("respawn failed: {e}")))?;

        state.transport = MultiplexedTransport::new(new_stream);
        state.child = new_child;
        state.socket_path = new_socket_path;
        state.generation += 1;

        let transport = state.transport.clone();
        drop(state);

        // Re-run init on the fresh process (ignore FunctionNotFound — init is optional).
        let init_id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let init_request = PluginRequest {
            id: init_id,
            method: "init".to_string(),
            params: self.init_options.clone(),
        };
        let init_payload = serde_json::to_value(&init_request)
            .map_err(|e| JsError::ExecutionError(format!("serialize error: {e}")))?;
        let init_frame = Frame {
            id: init_id,
            payload: init_payload,
        };

        match transport.send_recv(init_frame).await {
            Ok(_) | Err(TransportError::ConnectionClosed) => {}
            Err(e) => {
                return Err(JsError::ExecutionError(format!(
                    "init after respawn failed: {e}"
                )));
            }
        }

        Ok(())
    }

    pub fn health_check(&self) -> Result<serde_json::Value, JsError> {
        let state = self.state.try_lock().map_err(|_| {
            JsError::ExecutionError("state locked (concurrent call in progress)".into())
        })?;

        match state.child.id() {
            Some(pid) => Ok(serde_json::json!({
                "status": "ok",
                "pid": pid,
                "socket": state.socket_path.display().to_string(),
            })),
            None => Err(JsError::ExecutionError(
                "child process has no PID (not running)".into(),
            )),
        }
    }
}

#[async_trait::async_trait]
impl PluginRuntime for ExternalRuntime {
    async fn call(
        &self,
        function_name: &str,
        mut arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError> {
        if let Some(ref b) = body {
            merge_body_into_arg(&mut arg, b);
        }

        let mut result = tokio::time::timeout(timeout, self.send_recv(function_name, arg))
            .await
            .map_err(|_| JsError::Timeout)??;

        let body = result
            .as_object_mut()
            .and_then(|obj| obj.remove("body"))
            .map(JsBody::Json);

        Ok(CallOutput {
            value: result,
            body,
        })
    }

    async fn call_stream(
        &self,
        function_name: &str,
        mut arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<(CallOutput, StreamReceiver), JsError> {
        if let Some(ref b) = body {
            merge_body_into_arg(&mut arg, b);
        }

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let request = PluginRequest {
            id,
            method: function_name.to_string(),
            params: arg.clone(),
        };
        let payload = serde_json::to_value(&request)
            .map_err(|e| JsError::ExecutionError(format!("serialize error: {e}")))?;

        let (transport, generation) = {
            let state = self.state.lock().await;
            (state.transport.clone(), state.generation)
        };

        let result = self
            .do_call_stream(&transport, id, payload.clone(), function_name, timeout)
            .await;

        match result {
            Ok(pair) => Ok(pair),
            Err(e) => {
                log::warn!(
                    "plugin process for '{}' stream call failed, respawning: {}",
                    self.plugin_path,
                    e,
                );
                self.respawn_and_reinit_if_needed(generation).await?;

                // Retry once with the new transport.
                let id = self.next_id.fetch_add(1, Ordering::Relaxed);
                let request = PluginRequest {
                    id,
                    method: function_name.to_string(),
                    params: arg,
                };
                let payload = serde_json::to_value(&request)
                    .map_err(|e| JsError::ExecutionError(format!("serialize error: {e}")))?;

                let transport = {
                    let state = self.state.lock().await;
                    state.transport.clone()
                };

                self.do_call_stream(&transport, id, payload, function_name, timeout)
                    .await
            }
        }
    }

    fn call_blocking(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError> {
        let handle = match &self._runtime {
            Some(rt) => rt.handle().clone(),
            None => tokio::runtime::Handle::try_current()
                .map_err(|e| JsError::ExecutionError(format!("no tokio runtime available: {e}")))?,
        };
        if tokio::runtime::Handle::try_current().is_ok() {
            tokio::task::block_in_place(|| {
                handle.block_on(self.call(function_name, arg, body, timeout))
            })
        } else {
            handle.block_on(self.call(function_name, arg, body, timeout))
        }
    }
}

impl ExternalRuntime {
    /// Send a streaming request and read the metadata frame. Returns the
    /// `CallOutput` from the metadata and a `StreamReceiver` for subsequent chunks.
    async fn do_call_stream(
        &self,
        transport: &MultiplexedTransport,
        id: u64,
        payload: serde_json::Value,
        method: &str,
        timeout: Duration,
    ) -> Result<(CallOutput, StreamReceiver), JsError> {
        let frame = Frame { id, payload };
        let mut rx = transport
            .send_stream(frame)
            .await
            .map_err(|e| JsError::ExecutionError(format!("transport error: {e}")))?;

        // Read the metadata frame (status + headers, or an error).
        let meta_frame = tokio::time::timeout(timeout, rx.recv())
            .await
            .map_err(|_| JsError::Timeout)?
            .ok_or_else(|| JsError::ExecutionError("stream closed before metadata frame".into()))?
            .map_err(|e| JsError::ExecutionError(format!("transport error: {e}")))?;

        // Error responses use the top-level "error" field, not "result".
        if let Some(err) = meta_frame.payload.get("error").and_then(|v| v.as_str()) {
            if err.contains("not found in plugin exports") {
                let name = err
                    .strip_prefix("function '")
                    .and_then(|s| s.split('\'').next())
                    .map(str::to_string)
                    .unwrap_or_else(|| method.to_string());
                return Err(JsError::FunctionNotFound(name));
            }
            return Err(JsError::ExecutionError(err.to_string()));
        }

        let meta_result = meta_frame.payload["result"].clone();
        let call_output = CallOutput {
            value: meta_result,
            body: None,
        };

        Ok((call_output, map_to_stream_receiver(rx, timeout)))
    }
}

/// Spawn a Node.js plugin process and return a connected [`ExternalRuntime`].
pub async fn spawn(
    plugin_path: &str,
    init_options: serde_json::Value,
    permissions: InterceptorPermissions,
) -> Result<ExternalRuntime, Box<dyn Error + Send + Sync>> {
    let server_script = locate_server_script()?;
    let socket_dir = std::env::temp_dir();

    let (child, stream, socket_path) =
        process::spawn_process(&server_script, plugin_path, &socket_dir, &permissions).await?;

    Ok(ExternalRuntime {
        state: Mutex::new(RuntimeState {
            transport: MultiplexedTransport::new(stream),
            child,
            socket_path,
            generation: 0,
        }),
        next_id: AtomicU64::new(1),
        server_script,
        plugin_path: plugin_path.to_string(),
        socket_dir,
        permissions,
        init_options,
        _runtime: None,
    })
}

/// Spawn a Node.js plugin process from a non-async context (e.g. gateway startup).
pub fn spawn_sync(
    plugin_path: &str,
    init_options: serde_json::Value,
    permissions: InterceptorPermissions,
) -> Result<ExternalRuntime, Box<dyn Error + Send + Sync>> {
    let rt = tokio::runtime::Runtime::new()?;
    let mut handle = rt.block_on(spawn(plugin_path, init_options, permissions))?;
    handle._runtime = Some(rt);
    Ok(handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_body_json_inserts_body_key() {
        let mut arg = serde_json::json!({"method": "GET"});
        let body = JsBody::Json(serde_json::json!({"key": "value"}));
        merge_body_into_arg(&mut arg, &body);
        assert_eq!(arg["body"], serde_json::json!({"key": "value"}));
    }

    #[test]
    fn merge_body_text_inserts_string() {
        let mut arg = serde_json::json!({});
        let body = JsBody::Text("hello".to_string());
        merge_body_into_arg(&mut arg, &body);
        assert_eq!(arg["body"], serde_json::json!("hello"));
    }

    #[test]
    fn merge_body_bytes_inserts_base64_with_encoding() {
        let mut arg = serde_json::json!({});
        let body = JsBody::Bytes(vec![0x00, 0xFF, 0x42]);
        merge_body_into_arg(&mut arg, &body);

        use base64::Engine as _;
        let expected = base64::engine::general_purpose::STANDARD.encode([0x00, 0xFF, 0x42]);
        assert_eq!(arg["body"], serde_json::json!(expected));
        assert_eq!(arg["bodyEncoding"], serde_json::json!("base64"));
    }

    #[test]
    fn merge_body_on_non_object_is_noop() {
        let mut arg = serde_json::json!("not an object");
        let body = JsBody::Text("hello".to_string());
        merge_body_into_arg(&mut arg, &body);
        assert_eq!(arg, serde_json::json!("not an object"));
    }

    #[test]
    fn parse_response_extracts_result() {
        let payload = serde_json::json!({"id": 1u64, "result": {"status": 200}});
        let result = parse_response(payload, "handle").unwrap();
        assert_eq!(result["status"], 200);
    }

    #[test]
    fn parse_response_maps_error() {
        let payload = serde_json::json!({"id": 1u64, "error": "something went wrong"});
        let err = parse_response(payload, "handle").unwrap_err();
        assert!(
            matches!(err, JsError::ExecutionError(msg) if msg.contains("something went wrong"))
        );
    }

    #[test]
    fn parse_response_maps_function_not_found() {
        let payload = serde_json::json!({"id": 1u64, "error": "function 'handle' not found in plugin exports"});
        let err = parse_response(payload, "handle").unwrap_err();
        assert!(matches!(err, JsError::FunctionNotFound(name) if name == "handle"));
    }
}
