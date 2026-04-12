use std::collections::HashMap;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use gateway_core::interceptor::{InterceptorOutput, RequestInput};
use gateway_core::validation::schema::CompiledSchema;

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
// JSON schema validation
// ---------------------------------------------------------------------------

fn bench_schema_validation(c: &mut Criterion) {
    let schema_json = serde_json::json!({
        "type": "object",
        "properties": {
            "name":  { "type": "string" },
            "email": { "type": "string", "format": "email" },
            "age":   { "type": "integer", "minimum": 0 }
        },
        "required": ["name", "email"]
    });
    let schema = CompiledSchema::compile(&schema_json).unwrap();

    let valid = serde_json::json!({"name": "Alice", "email": "alice@example.com", "age": 30});
    let invalid = serde_json::json!({"age": "not-a-number"});

    let mut group = c.benchmark_group("schema_validation");

    group.bench_function("valid_input", |b| {
        b.iter(|| schema.validate(&valid).unwrap());
    });

    group.bench_function("invalid_input", |b| {
        b.iter(|| schema.validate(&invalid).unwrap_err());
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Interceptor serialization
// ---------------------------------------------------------------------------

fn bench_interceptor_serialization(c: &mut Criterion) {
    // Realistic request input with a handful of headers.
    let input = RequestInput {
        method: "POST".to_string(),
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
    bench_schema_validation,
    bench_interceptor_serialization
);
criterion_main!(benches);
