//! Request context token extraction.
//!
//! Re-exports the core types from [`plenum_config`] and provides a concrete
//! [`ExtractionCtx`] type alias bound to a newtype wrapper around
//! [`pingora_http::RequestHeader`].

pub mod config_value;

pub use plenum_config::context_ref::ContextRef;
pub use plenum_config::context_template::ContextTemplate;

use plenum_config::RequestData;

// ── Newtype wrapper for orphan rule ──────────────────────────────────────────

/// Newtype around [`pingora_http::RequestHeader`] to implement
/// [`RequestData`] without violating the orphan rule.
pub struct PingoraRequest<'a>(pub &'a pingora_http::RequestHeader);

impl RequestData for PingoraRequest<'_> {
    fn header(&self, name: &str) -> Option<&str> {
        self.0.headers.get(name).and_then(|v| v.to_str().ok())
    }

    fn uri_path(&self) -> &str {
        self.0.uri.path()
    }

    fn uri_query(&self) -> Option<&str> {
        self.0.uri.query()
    }

    fn method(&self) -> &str {
        self.0.method.as_str()
    }
}

// ── Concrete ExtractionCtx type alias ────────────────────────────────────────

/// Concrete [`ExtractionCtx`] bound to [`PingoraRequest`].
///
/// This type alias keeps all existing call sites in plenum-core unchanged.
pub type ExtractionCtx<'a> = plenum_config::ExtractionCtx<'a, PingoraRequest<'a>>;
