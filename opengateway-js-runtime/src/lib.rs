mod types;
mod worker;

pub use types::JsError;

use std::path::Path;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use types::JsCall;

/// Handle to a JS runtime running on a dedicated thread. Send + Sync.
pub struct JsRuntimeHandle {
    tx: mpsc::Sender<JsCall>,
    isolate_handle: deno_core::v8::IsolateHandle,
}

impl JsRuntimeHandle {
    /// Call an exported JS function with a JSON argument.
    /// Returns the function's return value as JSON, or an error.
    pub async fn call(
        &self,
        function_name: &str,
        arg: serde_json::Value,
        timeout: Duration,
    ) -> Result<serde_json::Value, JsError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        let call = JsCall {
            function_name: function_name.to_string(),
            arg,
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
}

/// Spawn a new JS runtime on a dedicated thread, loading the given ES module.
///
/// The module must assign functions to `globalThis` (e.g. `globalThis.hello = function(input) { ... }`).
pub async fn spawn_runtime(
    module_path: &Path,
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_path = module_path
        .canonicalize()
        .map_err(|e| format!("cannot resolve module path '{}': {e}", module_path.display()))?;

    let (tx, rx) = mpsc::channel::<JsCall>(32);
    let (ready_tx, ready_rx) = oneshot::channel();

    std::thread::Builder::new()
        .name(format!(
            "js-runtime-{}",
            module_path.file_name().unwrap_or_default().to_string_lossy()
        ))
        .spawn(move || {
            worker::run_worker(module_path, rx, ready_tx);
        })?;

    // Wait for the worker to finish loading the module and send back the isolate handle.
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
) -> Result<JsRuntimeHandle, Box<dyn std::error::Error>> {
    let module_path = module_path
        .canonicalize()
        .map_err(|e| format!("cannot resolve module path '{}': {e}", module_path.display()))?;

    let (tx, rx) = mpsc::channel::<JsCall>(32);
    let (ready_tx, ready_rx) = oneshot::channel();

    std::thread::Builder::new()
        .name(format!(
            "js-runtime-{}",
            module_path.file_name().unwrap_or_default().to_string_lossy()
        ))
        .spawn(move || {
            worker::run_worker(module_path, rx, ready_tx);
        })?;

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
        let handle = spawn_runtime(&fixture_path("hello.js")).await.unwrap();
        let result = handle
            .call(
                "hello",
                serde_json::json!({"name": "world"}),
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(result, serde_json::json!({"greeting": "hi world"}));
    }

    #[tokio::test]
    async fn test_function_not_found() {
        let handle = spawn_runtime(&fixture_path("hello.js")).await.unwrap();
        let result = handle
            .call(
                "nonexistent",
                serde_json::json!({}),
                Duration::from_secs(5),
            )
            .await;

        assert!(matches!(result, Err(JsError::FunctionNotFound(_))));
    }

    #[tokio::test]
    async fn test_execution_error() {
        let handle = spawn_runtime(&fixture_path("throws.js")).await.unwrap();
        let result = handle
            .call("doThrow", serde_json::json!({}), Duration::from_secs(5))
            .await;

        assert!(matches!(result, Err(JsError::ExecutionError(_))));
    }

    #[tokio::test]
    async fn test_module_not_found() {
        let result = spawn_runtime(Path::new("/nonexistent/module.js")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeout() {
        let handle = spawn_runtime(&fixture_path("infinite.js")).await.unwrap();
        let result = handle
            .call(
                "infinite",
                serde_json::json!({}),
                Duration::from_millis(200),
            )
            .await;

        assert!(matches!(result, Err(JsError::Timeout)));
    }

    #[tokio::test]
    async fn test_multiple_calls() {
        let handle = spawn_runtime(&fixture_path("hello.js")).await.unwrap();

        let r1 = handle
            .call(
                "hello",
                serde_json::json!({"name": "Alice"}),
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        let r2 = handle
            .call(
                "hello",
                serde_json::json!({"name": "Bob"}),
                Duration::from_secs(5),
            )
            .await
            .unwrap();

        assert_eq!(r1, serde_json::json!({"greeting": "hi Alice"}));
        assert_eq!(r2, serde_json::json!({"greeting": "hi Bob"}));
    }

    #[tokio::test]
    async fn test_recovery_after_timeout() {
        let handle = spawn_runtime(&fixture_path("mixed.js")).await.unwrap();

        // First call: timeout on infinite loop.
        let timeout_result = handle
            .call("spin", serde_json::json!({}), Duration::from_millis(200))
            .await;
        assert!(matches!(timeout_result, Err(JsError::Timeout)));

        // Give the worker a moment to process the termination.
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Second call: should succeed despite prior timeout.
        let ok_result = handle
            .call(
                "greet",
                serde_json::json!({"name": "world"}),
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(ok_result, serde_json::json!({"greeting": "hi world"}));
    }

    #[test]
    fn test_spawn_runtime_sync() {
        let handle = spawn_runtime_sync(&fixture_path("hello.js")).unwrap();
        // Use a temporary tokio runtime to call the async method.
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(handle.call(
            "hello",
            serde_json::json!({"name": "sync"}),
            Duration::from_secs(5),
        )).unwrap();
        assert_eq!(result, serde_json::json!({"greeting": "hi sync"}));
    }
}
