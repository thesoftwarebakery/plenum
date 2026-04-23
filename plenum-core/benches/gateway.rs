use std::collections::HashMap;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use plenum_core::interceptor::{InterceptorOutput, RequestInput};

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/// Build a matchit router with `n` routes of the form /api/v1/resource_N and
/// /api/v1/resource_N/{id}, then benchmark looking up a specific path.
fn build_router(n: usize) -> matchit::Router<usize> {
    let mut router = matchit::Router::new();
    for i in 0..n {
        router.insert(format!("/api/v1/resource_{i}"), i * 2).ok();
        router
            .insert(format!("/api/v1/resource_{i}/{{id}}"), i * 2 + 1)
            .ok();
    }
    router
}

fn bench_route_matching(c: &mut Criterion) {
    let sizes = [10usize, 50, 200, 1000];

    let mut group = c.benchmark_group("route_matching");
    for &n in &sizes {
        let router = build_router(n);
        // Look up a path that exists in the middle of the route table.
        let target = format!("/api/v1/resource_{}/123", n / 2);
        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &(router, target),
            |b, (r, path)| {
                b.iter(|| r.at(path.as_str()).unwrap());
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Interceptor serialization
// ---------------------------------------------------------------------------

fn bench_interceptor_serialization(c: &mut Criterion) {
    // Realistic request input with a handful of headers.
    let input = RequestInput {
        method: "POST".to_string(),
        route: "/api/v1/orders".to_string(),
        path: "/api/v1/orders".to_string(),
        query: "page=1&limit=20".to_string(),
        headers: {
            let mut m = HashMap::new();
            m.insert("content-type".to_string(), "application/json".to_string());
            m.insert(
                "authorization".to_string(),
                "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig".to_string(),
            );
            m.insert("x-request-id".to_string(), "abc-123-def-456".to_string());
            m.insert("user-agent".to_string(), "curl/7.88.1".to_string());
            m.insert("accept".to_string(), "application/json".to_string());
            m
        },
        params: HashMap::new(),
        operation: serde_json::Value::Null,
        ctx: serde_json::Value::Null,
    };

    let continue_json = serde_json::json!({
        "action": "continue",
        "headers": {
            "x-intercepted": "true",
            "x-request-id": null
        }
    });

    let mut group = c.benchmark_group("interceptor_serialization");

    group.bench_function("request_input_to_json", |b| {
        b.iter(|| serde_json::to_value(&input).unwrap());
    });

    group.bench_function("interceptor_output_from_json", |b| {
        b.iter(|| serde_json::from_value::<InterceptorOutput>(continue_json.clone()).unwrap());
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_route_matching,
    bench_interceptor_serialization
);
criterion_main!(benches);
