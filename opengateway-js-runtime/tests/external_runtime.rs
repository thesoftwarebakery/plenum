//! Integration tests for ExternalRuntime (Rust → Unix socket → Node.js).
//!
//! These tests require Node.js to be available on PATH and exercise the full
//! IPC path used in production.

use opengateway_js_runtime::{PluginRuntime, external};
use std::path::PathBuf;
use std::time::Duration;

fn noop_plugin_path() -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("node-runtime")
        .join("plugins")
        .join("noop.js")
        .to_string_lossy()
        .into_owned()
}

async fn spawn_noop() -> external::ExternalRuntime {
    external::spawn(&noop_plugin_path(), serde_json::json!({}))
        .await
        .expect("failed to spawn external plugin")
}

#[tokio::test(flavor = "multi_thread")]
async fn init_and_handle() {
    let runtime = spawn_noop().await;

    let init_result = runtime
        .call("init", serde_json::json!({}), None, Duration::from_secs(5))
        .await
        .expect("init failed");
    assert_eq!(init_result.value["status"], 200);

    let handle_result = runtime
        .call(
            "handle",
            serde_json::json!({
                "request": { "method": "GET", "path": "/test" }
            }),
            None,
            Duration::from_secs(5),
        )
        .await
        .expect("handle failed");

    // Body is extracted from the result by ExternalRuntime::call
    assert_eq!(handle_result.value["status"], 200);
    // noop returns body: params.request — check it's in JsBody
    assert!(
        handle_result.body.is_some(),
        "expected body to be extracted from plugin response"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn validate_succeeds() {
    let runtime = spawn_noop().await;

    let result = runtime
        .call(
            "validate",
            serde_json::json!({ "table": "users" }),
            None,
            Duration::from_secs(5),
        )
        .await
        .expect("validate failed");
    assert_eq!(result.value["valid"], true);
}

#[tokio::test(flavor = "multi_thread")]
async fn unknown_function_returns_error() {
    let runtime = spawn_noop().await;

    let result = runtime
        .call(
            "nonexistent",
            serde_json::json!({}),
            None,
            Duration::from_secs(5),
        )
        .await;

    assert!(result.is_err(), "expected error for unknown function");
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("not found"),
        "expected 'not found' in error, got: {err}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn call_blocking_works_in_tokio_context() {
    let runtime = spawn_noop().await;

    // call_blocking uses block_in_place when inside a tokio runtime.
    let result = runtime
        .call_blocking(
            "handle",
            serde_json::json!({ "request": { "method": "POST" } }),
            None,
            Duration::from_secs(5),
        )
        .expect("call_blocking failed");

    assert_eq!(result.value["status"], 200);
}

#[tokio::test(flavor = "multi_thread")]
async fn timeout_returns_error() {
    let runtime = spawn_noop().await;

    // Call "slow" (500ms delay) with a 50ms timeout — reliably triggers Timeout.
    let result = runtime
        .call(
            "slow",
            serde_json::json!({ "delay_ms": 500 }),
            None,
            Duration::from_millis(50),
        )
        .await;

    assert!(
        matches!(result, Err(opengateway_js_runtime::JsError::Timeout)),
        "expected Timeout, got: {result:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn spawn_sync_works_without_runtime() {
    // spawn_sync creates its own tokio runtime — test from a thread without one.
    let noop_path = noop_plugin_path();
    let result = std::thread::spawn(move || {
        external::spawn_sync(&noop_path, serde_json::json!({}))
    })
    .join()
    .expect("thread panicked");

    let runtime = result.expect("spawn_sync failed");
    let init = runtime
        .call_blocking("init", serde_json::json!({}), None, Duration::from_secs(5))
        .expect("init failed");
    assert_eq!(init.value["status"], 200);
}

#[tokio::test(flavor = "multi_thread")]
async fn health_check() {
    let runtime = spawn_noop().await;

    // health is a built-in method on the server, not a plugin function.
    let result = runtime
        .call("health", serde_json::json!({}), None, Duration::from_secs(5))
        .await
        .expect("health check failed");
    assert_eq!(result.value["status"], "ok");
}

#[tokio::test(flavor = "multi_thread")]
async fn ipc_latency_benchmark() {
    let runtime = spawn_noop().await;

    // Warmup
    for _ in 0..50 {
        runtime
            .call("handle", serde_json::json!({ "request": {} }), None, Duration::from_secs(5))
            .await
            .unwrap();
    }

    let iterations = 1000;
    let mut times = Vec::with_capacity(iterations);

    for _ in 0..iterations {
        let start = std::time::Instant::now();
        runtime
            .call(
                "handle",
                serde_json::json!({ "request": { "method": "GET", "path": "/bench" } }),
                None,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        times.push(start.elapsed().as_secs_f64() * 1000.0); // ms
    }

    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mean = times.iter().sum::<f64>() / times.len() as f64;
    let p50 = times[times.len() / 2];
    let p99 = times[(times.len() as f64 * 0.99) as usize];

    eprintln!("\n  Rust → Unix Socket → Node.js IPC Latency ({iterations} requests):");
    eprintln!("    mean: {mean:.3}ms");
    eprintln!("    p50:  {p50:.3}ms");
    eprintln!("    p99:  {p99:.3}ms");
    eprintln!("    min:  {:.3}ms", times[0]);
    eprintln!("    max:  {:.3}ms", times[times.len() - 1]);

    assert!(mean < 1.0, "mean IPC latency {mean:.3}ms exceeds 1ms threshold");
}
