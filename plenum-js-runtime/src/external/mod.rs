//! Out-of-process plugin runtime communicating over Unix domain sockets.
//!
//! The gateway spawns a Node.js process that listens on a Unix socket.
//! Messages use length-prefixed MessagePack framing:
//!   [4-byte big-endian payload length][msgpack payload]
//!
//! Request:  { id: number, method: string, params: any }
//! Response: { id: number, result?: any, error?: string }

mod process;
mod streaming;

pub use process::{locate_interceptor, locate_plugin, locate_server_script};

use std::error::Error;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::net::UnixStream;
use tokio::sync::Mutex;

use crate::{CallOutput, InterceptorPermissions, JsBody, JsError, PluginRuntime, StreamReceiver};

use streaming::{finish_stream_setup, write_request};

/// Maximum response payload size (10 MB). Responses exceeding this are rejected.
const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

/// Maximum number of restart attempts before a plugin is considered permanently failed.
const MAX_RESTARTS: u32 = 5;

/// A request sent from the gateway to the external plugin process.
#[derive(Serialize, Deserialize)]
struct PluginRequest {
    id: u64,
    method: String,
    params: serde_json::Value,
}

/// A response received from the external plugin process.
#[derive(Deserialize)]
struct PluginResponse {
    id: u64,
    result: Option<serde_json::Value>,
    error: Option<String>,
}

/// State shared behind a Mutex — the live connection to the Node.js process.
struct Connection {
    stream: Option<UnixStream>,
    child: tokio::process::Child,
    socket_path: PathBuf,
}

/// Handle to an external Node.js plugin process communicating over a Unix domain socket.
pub struct ExternalRuntime {
    /// Live connection to the child process (replaced on respawn).
    conn: Mutex<Connection>,
    next_id: AtomicU64,
    /// Server script path and plugin module path, stored for respawning.
    server_script: PathBuf,
    plugin_path: String,
    socket_dir: PathBuf,
    /// Permissions applied when spawning the process, stored for respawning.
    permissions: InterceptorPermissions,
    /// Options passed to `init()`, stored for re-initialisation after respawn.
    init_options: serde_json::Value,
    /// Tokio runtime that owns the UnixStream when spawned outside an existing runtime.
    _runtime: Option<tokio::runtime::Runtime>,
}

impl Drop for ExternalRuntime {
    fn drop(&mut self) {
        // Best-effort graceful shutdown: SIGTERM then socket cleanup.
        // We can't await here so we fire-and-forget.
        if let Ok(mut conn) = self.conn.try_lock() {
            let _ = conn.child.start_kill();
            let _ = std::fs::remove_file(&conn.socket_path);
        }

        // The tokio runtime cannot be dropped from an async context (panics).
        // Move it to a dedicated thread for shutdown.
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

impl ExternalRuntime {
    /// Send a request and read the response, respawning the process on socket errors.
    async fn send_recv(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, JsError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);

        let mut conn = self.conn.lock().await;

        // Attempt the call; on socket-level failure, try to respawn and retry once.
        match self
            .do_send_recv(&mut conn, id, method, params.clone())
            .await
        {
            Ok(v) => Ok(v),
            Err(e) => {
                // Check whether this looks like a broken socket (process crash).
                let is_io_error = matches!(e, JsError::ExecutionError(ref msg)
                    if msg.contains("socket") || msg.contains("broken pipe") || msg.contains("EOF") || msg.contains("stream taken"));

                if !is_io_error {
                    return Err(e);
                }

                // Attempt to respawn the process with backoff.
                let mut delay_ms = 100u64;
                let mut last_err = e;
                for attempt in 0..MAX_RESTARTS {
                    log::warn!(
                        "plugin process for '{}' appears to have crashed (attempt {}/{}), respawning in {}ms",
                        self.plugin_path,
                        attempt + 1,
                        MAX_RESTARTS,
                        delay_ms,
                    );
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    delay_ms = (delay_ms * 2).min(5000);

                    match self.respawn_and_reinit(&mut conn).await {
                        Ok(()) => {
                            // Retry the original call.
                            match self
                                .do_send_recv(&mut conn, id, method, params.clone())
                                .await
                            {
                                Ok(v) => return Ok(v),
                                Err(e) => {
                                    last_err = e;
                                    continue;
                                }
                            }
                        }
                        Err(e) => {
                            last_err = e;
                            continue;
                        }
                    }
                }

                Err(JsError::ExecutionError(format!(
                    "plugin '{}' failed after {} restart attempts: {}",
                    self.plugin_path, MAX_RESTARTS, last_err
                )))
            }
        }
    }

    /// Perform a single send/receive over the given connection.
    async fn do_send_recv(
        &self,
        conn: &mut Connection,
        id: u64,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, JsError> {
        let stream = conn
            .stream
            .as_mut()
            .ok_or_else(|| JsError::ExecutionError("stream taken for streaming call".into()))?;

        let request = PluginRequest {
            id,
            method: method.to_string(),
            params,
        };
        write_request(stream, &request).await?;

        // Read response frame and map "not found" errors.
        match Self::read_frame(stream, id).await {
            Ok(v) => Ok(v),
            Err(JsError::ExecutionError(ref msg))
                if msg.contains("not found in plugin exports") =>
            {
                let name = msg
                    .strip_prefix("function '")
                    .and_then(|s| s.split('\'').next())
                    .map(str::to_string)
                    .unwrap_or_else(|| method.to_string());
                Err(JsError::FunctionNotFound(name))
            }
            Err(e) => Err(e),
        }
    }

    /// Send a request and read the metadata response frame for a streaming call.
    /// Returns the metadata `CallOutput` and a reference to the live stream
    /// (the caller must `.take()` the stream from the connection afterward).
    async fn do_call_stream<'a>(
        &self,
        conn: &'a mut Connection,
        id: u64,
        method: &str,
        arg: serde_json::Value,
    ) -> Result<(CallOutput, &'a mut UnixStream), JsError> {
        let stream = conn.stream.as_mut().ok_or_else(|| {
            JsError::ExecutionError("stream taken for another streaming call".into())
        })?;

        // Send request frame.
        let request = PluginRequest {
            id,
            method: method.to_string(),
            params: arg,
        };
        write_request(stream, &request).await?;

        // Read metadata frame — should contain {status, headers, _stream: true}.
        let meta_value = Self::read_frame(stream, id).await?;

        Ok((
            CallOutput {
                value: meta_value,
                body: None,
            },
            stream,
        ))
    }

    /// Read a single msgpack frame from the stream and validate it against the expected id.
    /// Extracted so both `do_send_recv` and the streaming background task share the same logic.
    pub(crate) async fn read_frame(
        stream: &mut UnixStream,
        expected_id: u64,
    ) -> Result<serde_json::Value, JsError> {
        // Read length prefix.
        let mut len_buf = [0u8; 4];
        stream
            .read_exact(&mut len_buf)
            .await
            .map_err(|e| JsError::ExecutionError(format!("socket read error: {e}")))?;
        let resp_len = u32::from_be_bytes(len_buf) as usize;

        if resp_len > MAX_RESPONSE_BYTES {
            return Err(JsError::ExecutionError(format!(
                "response payload too large ({resp_len} bytes, max {MAX_RESPONSE_BYTES})"
            )));
        }

        // Read payload.
        let mut resp_buf = vec![0u8; resp_len];
        stream
            .read_exact(&mut resp_buf)
            .await
            .map_err(|e| JsError::ExecutionError(format!("socket read error: {e}")))?;

        let response: PluginResponse = rmp_serde::from_slice(&resp_buf)
            .map_err(|e| JsError::ExecutionError(format!("msgpack decode error: {e}")))?;

        if response.id != expected_id {
            return Err(JsError::ExecutionError(format!(
                "response id mismatch: expected {expected_id}, got {}",
                response.id
            )));
        }

        if let Some(err) = response.error {
            return Err(JsError::ExecutionError(err));
        }

        response
            .result
            .ok_or_else(|| JsError::ExecutionError("response has neither result nor error".into()))
    }

    /// Kill the current child process and spawn a fresh one, reconnecting the socket.
    async fn respawn(&self, conn: &mut Connection) -> Result<(), Box<dyn Error + Send + Sync>> {
        let _ = conn.child.start_kill();
        let _ = std::fs::remove_file(&conn.socket_path);

        let (new_child, new_stream, new_socket_path) = process::spawn_process(
            &self.server_script,
            &self.plugin_path,
            &self.socket_dir,
            &self.permissions,
        )
        .await?;

        conn.child = new_child;
        conn.stream = Some(new_stream);
        conn.socket_path = new_socket_path;
        Ok(())
    }

    /// Respawn the Node.js process and re-run the `init` function (if exported).
    /// Shared by `send_recv` and `call_stream` recovery paths.
    async fn respawn_and_reinit(&self, conn: &mut Connection) -> Result<(), JsError> {
        self.respawn(conn)
            .await
            .map_err(|re| JsError::ExecutionError(format!("respawn failed: {re}")))?;
        let init_id = self.next_id.fetch_add(1, Ordering::Relaxed);
        match self
            .do_send_recv(conn, init_id, "init", self.init_options.clone())
            .await
        {
            Ok(_) | Err(JsError::FunctionNotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }

    pub fn health_check(&self) -> Result<serde_json::Value, JsError> {
        let conn = self.conn.try_lock().map_err(|_| {
            JsError::ExecutionError("connection locked (concurrent call in progress)".into())
        })?;

        let pid = conn.child.id();
        match pid {
            Some(pid) => Ok(serde_json::json!({
                "status": "ok",
                "pid": pid,
                "socket": conn.socket_path.display().to_string(),
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
        // Merge body into arg for JS consumption.
        if let Some(ref b) = body {
            merge_body_into_arg(&mut arg, b);
        }

        let mut result = tokio::time::timeout(timeout, self.send_recv(function_name, arg))
            .await
            .map_err(|_| JsError::Timeout)??;

        // Extract the "body" field from the result, matching the convention used by
        // the in-process deno_core runtime.
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
        // Merge body into arg for JS consumption.
        if let Some(ref b) = body {
            merge_body_into_arg(&mut arg, b);
        }

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);

        // Lock the connection, send the request, and read the metadata frame.
        // On socket-level failure (or taken stream from previous streaming call),
        // respawn the process and retry once.
        let mut conn = self.conn.lock().await;

        // Clone arg so we still have it for the retry path.
        let first_arg = arg.clone();

        let result = self
            .do_call_stream(&mut conn, id, function_name, first_arg)
            .await;

        match result {
            Ok((call_output, _stream)) => finish_stream_setup(conn, call_output, id, timeout),
            Err(e) => {
                // Check if this is a recoverable socket error (broken pipe, EOF,
                // or a stream taken by a previous streaming call that completed).
                let is_recoverable = matches!(&e, JsError::ExecutionError(msg)
                    if msg.contains("socket") || msg.contains("broken pipe") || msg.contains("EOF") || msg.contains("stream taken"));

                if !is_recoverable {
                    return Err(e);
                }

                // Respawn and retry once.
                log::warn!(
                    "plugin process for '{}' stream call failed, respawning: {}",
                    self.plugin_path,
                    e,
                );
                self.respawn_and_reinit(&mut conn).await?;

                // Retry the streaming call.
                let id = self.next_id.fetch_add(1, Ordering::Relaxed);
                let (call_output, _stream) = self
                    .do_call_stream(&mut conn, id, function_name, arg)
                    .await?;

                finish_stream_setup(conn, call_output, id, timeout)
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
        // Use block_in_place when inside an active runtime to avoid nested-runtime panic.
        if tokio::runtime::Handle::try_current().is_ok() {
            tokio::task::block_in_place(|| {
                handle.block_on(self.call(function_name, arg, body, timeout))
            })
        } else {
            handle.block_on(self.call(function_name, arg, body, timeout))
        }
    }
}

/// Spawn a Node.js plugin process and return a connected [`ExternalRuntime`].
///
/// This is the async variant — use inside an existing tokio runtime.
/// After spawning, callers must call `init()` via the returned handle.
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
        conn: Mutex::new(Connection {
            stream: Some(stream),
            child,
            socket_path,
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
///
/// Creates a dedicated tokio runtime stored in the returned handle to keep the
/// `UnixStream` alive. After spawning, callers must call `init()` via the returned handle.
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
}
