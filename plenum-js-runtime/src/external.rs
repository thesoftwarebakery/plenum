//! Out-of-process plugin runtime communicating over Unix domain sockets.
//!
//! The gateway spawns a Node.js process that listens on a Unix socket.
//! Messages use length-prefixed MessagePack framing:
//!   [4-byte big-endian payload length][msgpack payload]
//!
//! Request:  { id: number, method: string, params: any }
//! Response: { id: number, result?: any, error?: string }

use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::{
    CallOutput, InterceptorPermissions, JsBody, JsError, PluginRuntime, StreamChunk, StreamReceiver,
};

/// Maximum response payload size (10 MB). Responses exceeding this are rejected.
const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

/// Maximum number of restart attempts before a plugin is considered permanently failed.
const MAX_RESTARTS: u32 = 5;

/// A request sent from the gateway to the external plugin process.
#[derive(Serialize)]
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
    child: Child,
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
            // start_kill sends SIGKILL immediately; we tried SIGTERM via the
            // server's SIGTERM handler. For cleanliness just kill here.
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

// ---------------------------------------------------------------------------
// Internal helpers: body merging, request writing, stream reader
// ---------------------------------------------------------------------------

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

/// Serialize a `PluginRequest` and write it as a length-prefixed msgpack frame.
async fn write_request(stream: &mut UnixStream, request: &PluginRequest) -> Result<(), JsError> {
    let payload = rmp_serde::to_vec_named(request)
        .map_err(|e| JsError::ExecutionError(format!("msgpack encode error: {e}")))?;

    stream
        .write_all(&(payload.len() as u32).to_be_bytes())
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket write error: {e}")))?;
    stream
        .write_all(&payload)
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket write error: {e}")))?;
    stream
        .flush()
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket flush error: {e}")))?;

    Ok(())
}

/// Spawn a background task that reads multi-frame msgpack responses from a
/// UnixStream and feeds them as `StreamChunk` items into an mpsc channel.
fn spawn_stream_reader(stream: UnixStream, id: u64, timeout: Duration) -> StreamReceiver {
    let (tx, rx) = tokio::sync::mpsc::channel(32);

    tokio::spawn(async move {
        let mut stream = stream;
        let mut stream_active = true;

        while stream_active {
            let chunk_result = tokio::time::timeout(timeout, async {
                ExternalRuntime::read_frame(&mut stream, id).await
            })
            .await;

            match chunk_result {
                Ok(Ok(value)) => {
                    if value
                        .as_object()
                        .and_then(|m| m.get("done"))
                        .and_then(|v| v.as_bool())
                        == Some(true)
                    {
                        let _ = tx.send(Ok(StreamChunk::Done)).await;
                        stream_active = false;
                    } else {
                        let chunk_bytes = value
                            .as_object()
                            .and_then(|m| m.get("chunk"))
                            .and_then(|v| {
                                v.as_str()
                                    .map(|s| s.as_bytes().to_vec())
                                    .or_else(|| serde_json::to_vec(v).ok())
                            })
                            .unwrap_or_default();

                        if tx.send(Ok(StreamChunk::Chunk(chunk_bytes))).await.is_err() {
                            stream_active = false;
                        }
                    }
                }
                Ok(Err(e)) => {
                    let _ = tx.send(Err(e)).await;
                    stream_active = false;
                }
                Err(_elapsed) => {
                    let _ = tx.send(Err(JsError::Timeout)).await;
                    stream_active = false;
                }
            }
        }
    });

    rx
}

/// Take ownership of the Unix stream from a locked connection, release the
/// lock, and spawn a background reader that feeds chunks into an mpsc channel.
/// Shared by the success and retry paths of `call_stream`.
fn finish_stream_setup(
    mut conn: tokio::sync::MutexGuard<'_, Connection>,
    call_output: CallOutput,
    id: u64,
    timeout: Duration,
) -> Result<(CallOutput, StreamReceiver), JsError> {
    let stream = conn
        .stream
        .take()
        .ok_or_else(|| JsError::ExecutionError("stream already taken".into()))?;
    drop(conn);
    let rx = spawn_stream_reader(stream, id, timeout);
    Ok((call_output, rx))
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
    async fn read_frame(
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
                "response too large: {resp_len} bytes (max {MAX_RESPONSE_BYTES})"
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

        let (new_child, new_stream, new_socket_path) = spawn_process(
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

// ---------------------------------------------------------------------------
// Process spawning helpers
// ---------------------------------------------------------------------------

/// Spawn a Node.js plugin server process and connect to it.
/// Returns `(child, stream, socket_path)`.
async fn spawn_process(
    server_script: &Path,
    plugin_path: &str,
    socket_dir: &Path,
    permissions: &InterceptorPermissions,
) -> Result<(Child, UnixStream, PathBuf), Box<dyn Error + Send + Sync>> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let socket_path = socket_dir.join(format!(
        "og-plugin-{}-{}.sock",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    // Clean up any stale socket file.
    let _ = std::fs::remove_file(&socket_path);

    // Build sandbox config from permissions.
    // Infrastructure paths (server script, plugin, socket) are only added when
    // OS-level sandboxing will actually be applied, so that the platform guard
    // doesn't fire on non-Linux when the user hasn't configured any restrictions.
    let user_wants_os_sandbox =
        !permissions.allowed_read_paths.is_empty() || !permissions.allowed_hosts.is_empty();

    let sandbox_config = plenum_sandbox::SandboxConfig {
        env: permissions.allowed_env_vars.iter().cloned().collect(),
        read: {
            let mut r = permissions.allowed_read_paths.clone();
            if user_wants_os_sandbox {
                if let Some(d) = server_script.parent() {
                    r.push(d.to_path_buf());
                }
                if let Some(d) = std::path::Path::new(plugin_path).parent() {
                    r.push(d.to_path_buf());
                }
            }
            r
        },
        write: if user_wants_os_sandbox {
            vec![socket_dir.to_path_buf()]
        } else {
            vec![]
        },
        net: permissions.allowed_hosts.iter().cloned().collect(),
    };

    let node_args = [
        server_script.as_os_str().to_owned(),
        "--socket".into(),
        socket_path.as_os_str().to_owned(),
        "--plugin".into(),
        plugin_path.into(),
    ];
    let std_cmd = plenum_sandbox::wrap_command("node", node_args, &sandbox_config)
        .map_err(|e| format!("failed to configure sandbox: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn node process: {e}"))?;

    // Wait for "ready\n" on stdout (10 second timeout).
    let stdout = child.stdout.take().ok_or("no stdout from child process")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            line.clear();
            let n = reader.read_line(&mut line).await?;
            if n == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "plugin process exited before becoming ready",
                ));
            }
            if line.trim() == "ready" {
                return Ok(());
            }
        }
    })
    .await
    .map_err(|_| "plugin process did not become ready within 10s")?
    .map_err(|e: std::io::Error| format!("error reading plugin stdout: {e}"))?;

    let stream = UnixStream::connect(&socket_path)
        .await
        .map_err(|e| format!("failed to connect to plugin socket at {socket_path:?}: {e}"))?;

    Ok((child, stream, socket_path))
}

/// Locate the bundled `server.js` for the node-runtime.
///
/// Resolution order:
///   1. `PLENUM_NODE_SERVER` env var (override for testing / custom deployments)
///   2. Alongside the gateway binary: `<binary_dir>/node-runtime/server.js`
///   3. Compile-time fallback: `<crate_dir>/node-runtime/server.js`
pub fn locate_server_script() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    // 1. Explicit override.
    if let Ok(path) = std::env::var("PLENUM_NODE_SERVER") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
        return Err(
            format!("PLENUM_NODE_SERVER is set to '{path}' but the file does not exist").into(),
        );
    }

    // 2. Alongside the running binary.
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe
            .parent()
            .map(|d| d.join("node-runtime").join("server.js"));
        if let Some(p) = candidate
            && p.exists()
        {
            return Ok(p);
        }
    }

    // 3. Compile-time crate directory (dev / cargo test).
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("node-runtime")
        .join("server.js");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("cannot locate node-runtime/server.js: set PLENUM_NODE_SERVER or place it alongside the gateway binary".into())
}

/// Locate a built-in interceptor JS file in the node-runtime/interceptors/ directory.
pub fn locate_interceptor(name: &str) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let server_script = locate_server_script()?;
    let interceptor_dir = server_script
        .parent()
        .ok_or("server.js has no parent directory")?
        .join("interceptors");
    let path = interceptor_dir.join(format!("{name}.js"));
    if !path.exists() {
        return Err(format!(
            "built-in interceptor '{name}' not found at '{}'; \
             ensure the node-runtime is correctly installed",
            path.display()
        )
        .into());
    }
    Ok(path)
}

/// Locate a built-in plugin JS file in the node-runtime/plugins/ directory.
pub fn locate_plugin(name: &str) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let server_script = locate_server_script()?;
    let plugin_dir = server_script
        .parent()
        .ok_or("server.js has no parent directory")?
        .join("plugins");
    let path = plugin_dir.join(format!("{name}.js"));
    if !path.exists() {
        return Err(format!(
            "built-in plugin '{name}' not found at '{}'; \
             ensure the node-runtime is correctly installed",
            path.display()
        )
        .into());
    }
    Ok(path)
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
        spawn_process(&server_script, plugin_path, &socket_dir, &permissions).await?;

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
