mod loader;
mod ops;
mod permissions;
mod types;
mod worker;

pub use permissions::InterceptorPermissions;
pub use types::{CallOutput, JsBody, JsError};

use std::path::Path;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use types::JsCall;

/// Channel pair returned by `start_worker`: ready receiver and call sender.
type WorkerChannel = (
    oneshot::Receiver<Result<types::WorkerReady, JsError>>,
    mpsc::Sender<JsCall>,
);

/// Handle to a JS runtime running on a dedicated thread. Send + Sync.
pub struct JsRuntimeHandle {
    tx: mpsc::Sender<JsCall>,
    isolate_handle: deno_core::v8::IsolateHandle,
}

impl JsRuntimeHandle {
    /// Call an exported JS function with a JSON argument and optional body.
    /// Returns the function's return value and any modified body, or an error.
    pub async fn call(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        let call = JsCall {
            function_name: function_name.to_string(),
            arg,
            body,
            reply: reply_tx,
        };

        self.tx
            .send(call)
            .await
            .map_err(|_| JsError::ExecutionError("JS runtime worker has shut down".into()))?;

        match tokio::time::timeout(timeout, reply_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(JsError::ExecutionError(
                "JS runtime worker dropped the reply channel".into(),
            )),
            Err(_) => {
                // Timeout — terminate V8 execution so the worker thread unblocks.
                self.isolate_handle.terminate_execution();
                Err(JsError::Timeout)
            }
        }
    }

    /// Synchronous variant of [`call`] for use from non-async contexts (e.g. pingora body filters).
    ///
    /// Internally blocks the calling thread until the JS function returns or the timeout expires.
    pub fn call_blocking(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        body: Option<JsBody>,
        timeout: Duration,
    ) -> Result<CallOutput, JsError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        let call = JsCall {
            function_name: function_name.to_string(),
            arg,
            body,
            reply: reply_tx,
        };

        self.tx
            .blocking_send(call)
            .map_err(|_| JsError::ExecutionError("JS runtime worker has shut down".into()))?;

        // Spawn a cancellable timeout thread. When the reply arrives (or this function
        // returns early), dropping `cancel_tx` signals the timeout thread to exit.
        let (cancel_tx, cancel_rx) = std::sync::mpsc::channel::<()>();
        let timed_out = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let timed_out_clone = timed_out.clone();
        let isolate_handle = self.isolate_handle.clone();

        std::thread::spawn(move || {
            // Cancelled (cancel_tx dropped) or disconnected — do nothing.
            if let Err(std::sync::mpsc::RecvTimeoutError::Timeout) = cancel_rx.recv_timeout(timeout)
            {
                timed_out_clone.store(true, std::sync::atomic::Ordering::Relaxed);
                isolate_handle.terminate_execution();
            }
        });

        let result = match reply_rx.blocking_recv() {
            Ok(r) => r,
            Err(_) => Err(JsError::ExecutionError(
                "JS runtime worker dropped the reply channel".into(),
            )),
        };

        // Signal the timeout thread to exit (no-op if it already fired).
        drop(cancel_tx);

        if timed_out.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(JsError::Timeout);
        }
        result
    }
}

/// Spawn the worker thread and return the ready-signal receiver and the call sender.
/// The caller is responsible for waiting on the receiver (async or blocking).
fn start_worker(
    module_source: types::ModuleSource,
    permissions: InterceptorPermissions,
) -> Result<WorkerChannel, Box<dyn std::error::Error>> {
    let thread_name = match &module_source {
        types::ModuleSource::FilePath(path) => format!(
            "js-runtime-{}",
            path.file_name().unwrap_or_default().to_string_lossy()
        ),
        types::ModuleSource::Inline { name, .. } => format!("js-runtime-{name}"),
    };
    let (tx, rx) = mpsc::channel::<JsCall>(32);
    let (ready_tx, ready_rx) = oneshot::channel();
    std::thread::Builder::new()
        .name(thread_name)
        .spawn(move || worker::run_worker(module_source, permissions, rx, ready_tx))?;
    Ok((ready_rx, tx))
}

/// Spawn a new JS runtime on a dedicated thread, loading the given ES module.
///
/// Interceptor functions must be exported using `export function <name>(...)` syntax.
pub async fn spawn_runtime(
    module_path: &Path,
    permissions: InterceptorPermissions,
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_path = module_path.canonicalize().map_err(|e| {
        format!(
            "cannot resolve module path '{}': {e}",
            module_path.display()
        )
    })?;
    let (ready_rx, tx) = start_worker(types::ModuleSource::FilePath(module_path), permissions)?;
    let ready = ready_rx
        .await
        .map_err(|_| "JS runtime worker thread exited before becoming ready")?
        .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
    Ok(JsRuntimeHandle {
        tx,
        isolate_handle: ready.isolate_handle,
    })
}

/// Like [`spawn_runtime`] but blocks the current thread until the module is loaded.
///
/// Use this when no tokio runtime is available (e.g. during synchronous startup).
pub fn spawn_runtime_sync(
    module_path: &Path,
    permissions: InterceptorPermissions,
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_path = module_path.canonicalize().map_err(|e| {
        format!(
            "cannot resolve module path '{}': {e}",
            module_path.display()
        )
    })?;
    let (ready_rx, tx) = start_worker(types::ModuleSource::FilePath(module_path), permissions)?;
    let ready = ready_rx
        .blocking_recv()
        .map_err(|_| "JS runtime worker thread exited before becoming ready")?
        .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
    Ok(JsRuntimeHandle {
        tx,
        isolate_handle: ready.isolate_handle,
    })
}

/// Spawn a new JS runtime on a dedicated thread, executing the given inline JS source.
///
/// Interceptor functions must be exported using `export function <name>(...)` syntax.
/// The `name` is used for error messages and thread naming.
pub async fn spawn_runtime_from_source(
    name: &str,
    source: &str,
    permissions: InterceptorPermissions,
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_source = types::ModuleSource::Inline {
        name: name.to_string(),
        source: source.to_string(),
    };
    let (ready_rx, tx) = start_worker(module_source, permissions)?;
    let ready = ready_rx
        .await
        .map_err(|_| "JS runtime worker thread exited before becoming ready")?
        .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
    Ok(JsRuntimeHandle {
        tx,
        isolate_handle: ready.isolate_handle,
    })
}

/// Like [`spawn_runtime_from_source`] but blocks the current thread until the source is evaluated.
///
/// Use this when no tokio runtime is available (e.g. during synchronous startup).
pub fn spawn_runtime_from_source_sync(
    name: &str,
    source: &str,
    permissions: InterceptorPermissions,
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_source = types::ModuleSource::Inline {
        name: name.to_string(),
        source: source.to_string(),
    };
    let (ready_rx, tx) = start_worker(module_source, permissions)?;
    let ready = ready_rx
        .blocking_recv()
        .map_err(|_| "JS runtime worker thread exited before becoming ready")?
        .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
    Ok(JsRuntimeHandle {
        tx,
        isolate_handle: ready.isolate_handle,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn fixture_path(name: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    #[tokio::test]
    async fn test_call_hello() {
        let handle = spawn_runtime(&fixture_path("hello.js"), InterceptorPermissions::default())
            .await
            .unwrap();
        let result = handle
            .call(
                "hello",
                serde_json::json!({"name": "world"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result.value, serde_json::json!({"greeting": "hi world"}));
        assert!(result.body.is_none());
    }

    #[tokio::test]
    async fn test_function_not_found() {
        let handle = spawn_runtime(&fixture_path("hello.js"), InterceptorPermissions::default())
            .await
            .unwrap();
        let result = handle
            .call(
                "nonexistent",
                serde_json::json!({}),
                None,
                Duration::from_secs(5),
            )
            .await;

        assert!(matches!(result, Err(JsError::FunctionNotFound(_))));
    }

    #[tokio::test]
    async fn test_execution_error() {
        let handle = spawn_runtime(
            &fixture_path("throws.js"),
            InterceptorPermissions::default(),
        )
        .await
        .unwrap();
        let result = handle
            .call(
                "doThrow",
                serde_json::json!({}),
                None,
                Duration::from_secs(5),
            )
            .await;

        assert!(matches!(result, Err(JsError::ExecutionError(_))));
    }

    #[tokio::test]
    async fn test_module_not_found() {
        let result = spawn_runtime(
            Path::new("/nonexistent/module.js"),
            InterceptorPermissions::default(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeout() {
        let handle = spawn_runtime(
            &fixture_path("infinite.js"),
            InterceptorPermissions::default(),
        )
        .await
        .unwrap();
        let result = handle
            .call(
                "infinite",
                serde_json::json!({}),
                None,
                Duration::from_millis(200),
            )
            .await;

        assert!(matches!(result, Err(JsError::Timeout)));
    }

    #[tokio::test]
    async fn test_multiple_calls() {
        let handle = spawn_runtime(&fixture_path("hello.js"), InterceptorPermissions::default())
            .await
            .unwrap();

        let r1 = handle
            .call(
                "hello",
                serde_json::json!({"name": "Alice"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        let r2 = handle
            .call(
                "hello",
                serde_json::json!({"name": "Bob"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(r1.value, serde_json::json!({"greeting": "hi Alice"}));
        assert_eq!(r2.value, serde_json::json!({"greeting": "hi Bob"}));
    }

    #[tokio::test]
    async fn test_recovery_after_timeout() {
        let handle = spawn_runtime(&fixture_path("mixed.js"), InterceptorPermissions::default())
            .await
            .unwrap();

        // First call: timeout on infinite loop.
        let timeout_result = handle
            .call(
                "spin",
                serde_json::json!({}),
                None,
                Duration::from_millis(200),
            )
            .await;
        assert!(matches!(timeout_result, Err(JsError::Timeout)));

        // Give the worker a moment to process the termination.
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Second call: should succeed despite prior timeout.
        let ok_result = handle
            .call(
                "greet",
                serde_json::json!({"name": "world"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(ok_result.value, serde_json::json!({"greeting": "hi world"}));
    }

    #[test]
    fn test_spawn_runtime_sync() {
        let handle =
            spawn_runtime_sync(&fixture_path("hello.js"), InterceptorPermissions::default())
                .unwrap();
        // Use a temporary tokio runtime to call the async method.
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(handle.call(
                "hello",
                serde_json::json!({"name": "sync"}),
                None,
                Duration::from_secs(5),
            ))
            .unwrap();
        assert_eq!(result.value, serde_json::json!({"greeting": "hi sync"}));
    }

    #[test]
    fn test_call_blocking() {
        let handle =
            spawn_runtime_sync(&fixture_path("hello.js"), InterceptorPermissions::default())
                .unwrap();
        let result = handle
            .call_blocking(
                "hello",
                serde_json::json!({"name": "blocking"}),
                None,
                Duration::from_secs(5),
            )
            .unwrap();
        assert_eq!(result.value, serde_json::json!({"greeting": "hi blocking"}));
    }

    #[test]
    fn test_call_blocking_timeout() {
        let handle = spawn_runtime_sync(
            &fixture_path("infinite.js"),
            InterceptorPermissions::default(),
        )
        .unwrap();
        let result = handle.call_blocking(
            "infinite",
            serde_json::json!({}),
            None,
            Duration::from_millis(200),
        );
        assert!(matches!(result, Err(JsError::Timeout)));
    }

    #[tokio::test]
    async fn test_spawn_from_source() {
        let source = r#"
            export function hello(input) {
                return { greeting: "hi " + input.name };
            }
        "#;
        let handle =
            spawn_runtime_from_source("test-inline", source, InterceptorPermissions::default())
                .await
                .unwrap();
        let result = handle
            .call(
                "hello",
                serde_json::json!({"name": "world"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(result.value, serde_json::json!({"greeting": "hi world"}));
    }

    #[tokio::test]
    async fn test_spawn_from_source_syntax_error() {
        let source = "this is not valid javascript }{{{";
        let result =
            spawn_runtime_from_source("bad-source", source, InterceptorPermissions::default())
                .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_spawn_from_source_sync() {
        let source = r#"export function greet(i) { return { msg: "ok" }; }"#;
        let handle = spawn_runtime_from_source_sync(
            "sync-inline",
            source,
            InterceptorPermissions::default(),
        )
        .unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(handle.call("greet", serde_json::json!({}), None, Duration::from_secs(5)))
            .unwrap();
        assert_eq!(result.value, serde_json::json!({"msg": "ok"}));
    }

    /// Interceptor that reads OpenGateway.env.get("TEST_VAR") and returns it.
    #[tokio::test]
    async fn test_env_op_allowed() {
        let source = r#"
            export function readEnv(input) {
                const val = OpenGateway.env.get(input.key);
                return { value: val || null };
            }
        "#;
        let mut perms = InterceptorPermissions::default();
        perms.allowed_env_vars.insert("TEST_VAR".to_string());

        // SAFETY: test-only, single-threaded tokio test, no races.
        unsafe { std::env::set_var("TEST_VAR", "hello_from_env") };
        let handle = spawn_runtime_from_source("env-allowed", source, perms)
            .await
            .unwrap();
        let result = handle
            .call(
                "readEnv",
                serde_json::json!({"key": "TEST_VAR"}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(result.value, serde_json::json!({"value": "hello_from_env"}));
    }

    /// Interceptor that tries to read OpenGateway.env.get("SECRET") without permission should fail.
    #[tokio::test]
    async fn test_env_op_denied() {
        let source = r#"
            export function readEnv(input) {
                const val = OpenGateway.env.get(input.key);
                return { value: val || null };
            }
        "#;
        // Default permissions: no env vars allowed.
        let handle =
            spawn_runtime_from_source("env-denied", source, InterceptorPermissions::default())
                .await
                .unwrap();
        let result = handle
            .call(
                "readEnv",
                serde_json::json!({"key": "SECRET"}),
                None,
                Duration::from_secs(5),
            )
            .await;
        // Should fail because SECRET is not in allowed_env_vars.
        assert!(
            matches!(result, Err(JsError::ExecutionError(_))),
            "expected ExecutionError for denied env access, got: {result:?}"
        );
    }

    // ---- Web Platform API tests ---------------------------------------------------

    /// Starts a minimal HTTP/1.1 server that responds 200 OK with a fixed JSON body.
    /// Returns the bound port. The server runs until the returned JoinHandle is dropped.
    async fn start_stub_http_server(
        response_body: &'static str,
    ) -> (u16, tokio::task::JoinHandle<()>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        // Bind before spawning so the port is ready synchronously.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let handle = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    // Drain incoming request bytes before replying.
                    let mut buf = [0u8; 4096];
                    let _ = stream.read(&mut buf).await;
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        response_body.len(),
                        response_body
                    );
                    let _ = stream.write_all(resp.as_bytes()).await;
                });
            }
        });

        (port, handle)
    }

    #[tokio::test]
    async fn test_async_fetch_allowed() {
        let (port, _server) = start_stub_http_server(r#"{"ok":true}"#).await;
        let url = format!("http://127.0.0.1:{port}/test");

        let source = r#"
            export async function doFetch(input) {
                const resp = await fetch(input.url);
                const data = await resp.json();
                return { status: resp.status, ok: data.ok };
            }
            "#
        .to_string();

        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("127.0.0.1".to_string());

        let handle = spawn_runtime_from_source("fetch-allowed", source.leak(), perms)
            .await
            .unwrap();

        let result = handle
            .call(
                "doFetch",
                serde_json::json!({ "url": url }),
                None,
                Duration::from_secs(10),
            )
            .await
            .unwrap();

        assert_eq!(result.value["status"], 200);
        assert_eq!(result.value["ok"], true);
    }

    #[tokio::test]
    async fn test_fetch_denied() {
        let source = r#"
            export async function doFetch(input) {
                const resp = await fetch("http://example.com");
                return { status: resp.status };
            }
        "#;

        let handle =
            spawn_runtime_from_source("fetch-denied", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "doFetch",
                serde_json::json!({}),
                None,
                Duration::from_secs(5),
            )
            .await;

        assert!(
            matches!(result, Err(JsError::ExecutionError(_))),
            "expected ExecutionError for denied fetch, got: {result:?}"
        );
    }

    #[tokio::test]
    async fn test_crypto_random_uuid() {
        let source = r#"
            export function getUuid() {
                return { uuid: crypto.randomUUID() };
            }
        "#;

        let handle =
            spawn_runtime_from_source("crypto-uuid", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "getUuid",
                serde_json::json!({}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        let uuid = result.value["uuid"].as_str().unwrap();
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.chars().filter(|&c| c == '-').count(), 4);
    }

    #[tokio::test]
    async fn test_text_encoder_decoder() {
        let source = r#"
            export function roundtrip(input) {
                const encoded = new TextEncoder().encode(input.text);
                const decoded = new TextDecoder().decode(encoded);
                return { decoded };
            }
        "#;

        let handle =
            spawn_runtime_from_source("text-encoder", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "roundtrip",
                serde_json::json!({ "text": "hello world" }),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result.value["decoded"], "hello world");
    }

    #[tokio::test]
    async fn test_url_parse() {
        let source = r#"
            export function parseUrl(input) {
                const url = new URL(input.raw);
                return { host: url.hostname, path: url.pathname };
            }
        "#;

        let handle =
            spawn_runtime_from_source("url-parse", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "parseUrl",
                serde_json::json!({ "raw": "https://example.com/api/v1?foo=bar" }),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result.value["host"], "example.com");
        assert_eq!(result.value["path"], "/api/v1");
    }

    #[tokio::test]
    async fn test_console_no_crash() {
        let source = r#"
            export function logStuff() {
                console.log("hello from interceptor");
                console.warn("a warning");
                console.error("an error");
                return { ok: true };
            }
        "#;

        let handle =
            spawn_runtime_from_source("console", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "logStuff",
                serde_json::json!({}),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result.value["ok"], true);
    }

    // ---- TCP socket tests --------------------------------------------------------

    /// Starts a TCP echo server: reads bytes from each connection and writes them back.
    async fn start_tcp_echo_server() -> (u16, tokio::task::JoinHandle<()>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let handle = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    loop {
                        let n = match stream.read(&mut buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        if stream.write_all(&buf[..n]).await.is_err() {
                            break;
                        }
                    }
                });
            }
        });

        (port, handle)
    }

    #[tokio::test]
    async fn test_tcp_echo_round_trip() {
        let (port, _server) = start_tcp_echo_server().await;

        let source = r#"
            export async function tcpEcho(input) {
                const conn = await Deno.connect({ hostname: "127.0.0.1", port: input.port });
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                await conn.write(encoder.encode("hello tcp"));

                const buf = new Uint8Array(64);
                const n = await conn.read(buf);
                conn.close();

                return { echo: decoder.decode(buf.subarray(0, n)) };
            }
        "#;

        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("127.0.0.1".to_string());

        let handle = spawn_runtime_from_source("tcp-echo", source, perms)
            .await
            .unwrap();

        let result = handle
            .call(
                "tcpEcho",
                serde_json::json!({ "port": port }),
                None,
                Duration::from_secs(10),
            )
            .await
            .unwrap();

        assert_eq!(result.value["echo"], "hello tcp");
    }

    #[tokio::test]
    async fn test_tcp_connect_permission_denied() {
        let (port, _server) = start_tcp_echo_server().await;

        let source = r#"
            export async function doConnect(input) {
                const conn = await Deno.connect({ hostname: "127.0.0.1", port: input.port });
                conn.close();
                return { ok: true };
            }
        "#;

        // Default permissions: no hosts allowed.
        let handle =
            spawn_runtime_from_source("tcp-denied", source, InterceptorPermissions::default())
                .await
                .unwrap();

        let result = handle
            .call(
                "doConnect",
                serde_json::json!({ "port": port }),
                None,
                Duration::from_secs(5),
            )
            .await;

        assert!(
            matches!(result, Err(JsError::ExecutionError(_))),
            "expected ExecutionError for denied TCP connect, got: {result:?}"
        );
    }

    #[tokio::test]
    async fn test_tcp_close_read_returns_null() {
        let (port, _server) = start_tcp_echo_server().await;

        let source = r#"
            export async function closeAndRead(input) {
                const conn = await Deno.connect({ hostname: "127.0.0.1", port: input.port });
                conn.close();
                const buf = new Uint8Array(64);
                const n = await conn.read(buf);
                return { n: n };
            }
        "#;

        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("127.0.0.1".to_string());

        let handle = spawn_runtime_from_source("tcp-close", source, perms)
            .await
            .unwrap();

        let result = handle
            .call(
                "closeAndRead",
                serde_json::json!({ "port": port }),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        // After close(), read() returns null immediately (JS-side #closed flag).
        assert!(
            result.value["n"].is_null(),
            "expected null after close, got: {}",
            result.value["n"]
        );
    }

    #[tokio::test]
    async fn test_tcp_socket_options() {
        let (port, _server) = start_tcp_echo_server().await;

        let source = r#"
            export async function setOptions(input) {
                const conn = await Deno.connect({ hostname: "127.0.0.1", port: input.port });
                conn.setNoDelay(true);
                conn.setKeepAlive(true);
                conn.close();
                return { ok: true };
            }
        "#;

        let mut perms = InterceptorPermissions::default();
        perms.allowed_hosts.insert("127.0.0.1".to_string());

        let handle = spawn_runtime_from_source("tcp-options", source, perms)
            .await
            .unwrap();

        let result = handle
            .call(
                "setOptions",
                serde_json::json!({ "port": port }),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result.value["ok"], true);
    }
}
