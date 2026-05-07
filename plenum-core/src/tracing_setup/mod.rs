//! Tracing subscriber setup and OpenTelemetry integration.
//!
//! Initializes a `tracing-subscriber` pipeline that replaces `env_logger`.
//! Always installs a `fmt` layer filtered by `RUST_LOG`. When the `otel`
//! feature is compiled in and a [`TracingConfig`] with `enabled: true` is
//! provided, an OpenTelemetry layer with OTLP gRPC export is added.
//!
//! ## Subscriber architecture
//!
//! ```text
//! tracing::Registry
//! ├── EnvFilter          (RUST_LOG-based filtering)
//! ├── fmt::Layer         (human-readable log output to stderr)
//! └── OpenTelemetryLayer (optional — OTLP span export when tracing.enabled=true)
//! ```
//!
//! The `fmt` layer bridges `log::*` macros automatically via `tracing-log`,
//! so existing `log::info!()` / `log::warn!()` calls throughout the codebase
//! continue to work.
//!
//! ## Span hierarchy (when OTel is enabled)
//!
//! ```text
//! http.request                    ← top-level, carries method/route/status
//! ├── route_match                 ← route resolution
//! ├── interceptor_call            ← per-interceptor (hook + function fields)
//! │   └── ...
//! ├── interceptor_call            ← before_upstream phase
//! └── interceptor_call            ← on_response / on_response_body phases
//! ```
//!
//! ## W3C Trace Context propagation
//!
//! When OTel is enabled, incoming `traceparent` / `tracestate` headers are
//! extracted and set as the parent of the `http.request` span. Outgoing
//! upstream requests receive `traceparent` / `tracestate` headers injected
//! from the current span context (see [`inject_context`]).
//!
//! ## Tokio runtime requirement
//!
//! The tonic gRPC exporter requires a tokio reactor during construction.
//! Since this module is called before pingora creates its runtimes, a
//! short-lived tokio runtime is created internally just to build the
//! exporter channel. This is safe because pingora creates independent
//! runtimes in `run_forever()` and the tonic channel is runtime-agnostic
//! once constructed.

use crate::config::TracingConfig;

/// Initialize the global tracing subscriber.
///
/// Always installs a `fmt` layer (replacing `env_logger`) filtered by `RUST_LOG`.
/// When `config` is `Some`, enabled, and the `otel` feature is compiled in,
/// also installs an OpenTelemetry layer with OTLP gRPC export.
///
/// Returns an [`OtelGuard`] that flushes the OTel pipeline on drop. Hold it
/// alive for the lifetime of the process.
pub fn init(config: Option<&TracingConfig>) -> Option<OtelGuard> {
    #[cfg(feature = "otel")]
    {
        init_with_otel(config)
    }
    #[cfg(not(feature = "otel"))]
    {
        let _ = config;
        init_fmt_only();
        None
    }
}

/// Guard that shuts down the OpenTelemetry tracer provider on drop,
/// flushing any pending spans.
pub struct OtelGuard {
    #[cfg(feature = "otel")]
    provider: opentelemetry_sdk::trace::SdkTracerProvider,
}

impl Drop for OtelGuard {
    fn drop(&mut self) {
        #[cfg(feature = "otel")]
        if let Err(e) = self.provider.shutdown() {
            eprintln!("error shutting down OTel tracer provider: {e}");
        }
    }
}

#[cfg(not(feature = "otel"))]
fn init_fmt_only() {
    use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer())
        .init();
}

#[cfg(feature = "otel")]
fn init_with_otel(config: Option<&TracingConfig>) -> Option<OtelGuard> {
    use opentelemetry::global;
    use opentelemetry::trace::TracerProvider;
    use opentelemetry_otlp::{SpanExporter, WithExportConfig};
    use opentelemetry_sdk::propagation::TraceContextPropagator;
    use opentelemetry_sdk::trace::{Sampler, SdkTracerProvider};
    use opentelemetry_sdk::{Resource, trace::BatchSpanProcessor};
    use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

    let env_filter = EnvFilter::from_default_env();
    let fmt_layer = fmt::layer();

    let should_enable = config.is_some_and(|c| c.enabled);
    if !should_enable {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt_layer)
            .init();
        return None;
    }

    let config = config.unwrap();

    // The tonic gRPC channel requires a tokio reactor during construction.
    // Pingora creates its own runtimes later in run_forever(), so we spin up
    // a short-lived runtime here just to build the exporter. The resulting
    // channel is runtime-agnostic once created.
    let rt = tokio::runtime::Runtime::new().unwrap_or_else(|e| {
        eprintln!("failed to create tokio runtime for OTLP exporter: {e}");
        std::process::exit(1);
    });
    let exporter = rt.block_on(async {
        SpanExporter::builder()
            .with_tonic()
            .with_endpoint(&config.endpoint)
            .build()
            .unwrap_or_else(|e| {
                eprintln!("failed to create OTLP exporter: {e}");
                std::process::exit(1);
            })
    });
    drop(rt);

    let resource = Resource::builder()
        .with_service_name(config.service_name.clone())
        .build();

    let sampler = Sampler::TraceIdRatioBased(config.sample_rate);
    let provider = SdkTracerProvider::builder()
        .with_sampler(sampler)
        .with_resource(resource)
        .with_span_processor(BatchSpanProcessor::builder(exporter).build())
        .build();

    global::set_tracer_provider(provider.clone());
    global::set_text_map_propagator(TraceContextPropagator::new());

    let otel_layer = tracing_opentelemetry::layer().with_tracer(provider.tracer("plenum"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();

    Some(OtelGuard { provider })
}

// ── W3C Trace Context Propagation ───────────────────────────────────────────

#[cfg(feature = "otel")]
pub use propagation::*;

#[cfg(feature = "otel")]
mod propagation {
    use opentelemetry::propagation::{Extractor, Injector, TextMapPropagator};
    use opentelemetry_sdk::propagation::TraceContextPropagator;

    /// Adapter that lets the OTel propagator read from pingora request headers.
    struct HeaderExtractor<'a>(&'a pingora_http::RequestHeader);

    impl Extractor for HeaderExtractor<'_> {
        fn get(&self, key: &str) -> Option<&str> {
            self.0.headers.get(key)?.to_str().ok()
        }

        fn keys(&self) -> Vec<&str> {
            self.0.headers.keys().map(|k| k.as_str()).collect()
        }
    }

    /// Adapter that lets the OTel propagator write to pingora request headers.
    struct HeaderInjector<'a>(&'a mut pingora_http::RequestHeader);

    impl Injector for HeaderInjector<'_> {
        fn set(&mut self, key: &str, value: String) {
            if let Ok(name) = http::header::HeaderName::from_bytes(key.as_bytes()) {
                self.0.insert_header(name, value.as_bytes()).ok();
            }
        }
    }

    /// Extract W3C trace context (`traceparent` / `tracestate`) from incoming
    /// request headers.
    pub fn extract_context(headers: &pingora_http::RequestHeader) -> opentelemetry::Context {
        let propagator = TraceContextPropagator::new();
        propagator.extract(&HeaderExtractor(headers))
    }

    /// Inject W3C trace context (`traceparent` / `tracestate`) into upstream
    /// request headers.
    pub fn inject_context(headers: &mut pingora_http::RequestHeader, cx: &opentelemetry::Context) {
        let propagator = TraceContextPropagator::new();
        propagator.inject_context(cx, &mut HeaderInjector(headers));
    }
}
