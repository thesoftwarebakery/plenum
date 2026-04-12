use std::path::PathBuf;
use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};
use opengateway_js_runtime::{InterceptorPermissions, spawn_runtime_sync};
use tokio::runtime::Runtime;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// How long V8 isolate creation + ES module loading takes.
/// This runs once at gateway startup per unique interceptor module.
fn bench_spawn_runtime(c: &mut Criterion) {
    c.bench_function("spawn_runtime", |b| {
        b.iter(|| {
            let _handle = spawn_runtime_sync(&fixture_path("hello.js"), InterceptorPermissions::default()).unwrap();
            // Handle is dropped here, which stops the worker thread.
        });
    });
}

/// Per-request call latency on an already-initialized runtime.
/// This is the steady-state cost of one interceptor invocation.
/// criterion's warm_up_time allows V8's JIT to stabilize before measurement.
fn bench_call_roundtrip(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let handle = spawn_runtime_sync(&fixture_path("hello.js"), InterceptorPermissions::default()).unwrap();

    let mut group = c.benchmark_group("call_roundtrip");
    group.warm_up_time(Duration::from_secs(5));
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(50);

    group.bench_function("hello", |b| {
        b.iter(|| {
            rt.block_on(handle.call(
                "hello",
                serde_json::json!({"name": "bench"}),
                None,
                Duration::from_secs(5),
            ))
            .unwrap()
        });
    });

    group.finish();
}

/// Cost of calling two different functions on the same runtime.
/// Since the fn_cache caches by name, both calls should have the same
/// steady-state latency as a single-function benchmark after first use.
/// The first call for each name pays the execute_script lookup once.
fn bench_function_lookup(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let handle = spawn_runtime_sync(&fixture_path("two_functions.js"), InterceptorPermissions::default()).unwrap();

    let mut group = c.benchmark_group("function_lookup");
    group.warm_up_time(Duration::from_secs(5));
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(50);

    // Alternate between two function names. After the first call for each name
    // the cache kicks in and both should hit the same steady-state latency.
    let mut i = 0u64;
    group.bench_function("alternating_cached", |b| {
        b.iter(|| {
            let name = if i % 2 == 0 { "hello" } else { "goodbye" };
            i += 1;
            rt.block_on(handle.call(
                name,
                serde_json::json!({"name": "bench"}),
                None,
                Duration::from_secs(5),
            ))
            .unwrap()
        });
    });

    group.finish();
}

criterion_group! {
    name = benches;
    config = Criterion::default();
    targets = bench_spawn_runtime, bench_call_roundtrip, bench_function_lookup
}
criterion_main!(benches);
