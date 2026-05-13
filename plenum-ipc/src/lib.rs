//! Frame-level multiplexed transport over an async byte stream.
//!
//! Provides [`MultiplexedTransport`] — a cloneable handle to a single
//! underlying connection (typically a Unix domain socket) that routes
//! concurrent request/response pairs by `id`.
//!
//! The crate knows nothing about application protocol: it routes frames by
//! their `id` field, but never inspects other fields such as `method`,
//! `result`, or `chunk`. Application semantics (request/response, streaming)
//! are built on top by the caller.
//!
//! # Wire format
//!
//! ```text
//! [4-byte big-endian payload length][msgpack payload]
//! ```
//!
//! Both inbound and outbound frames are `serde_json::Value` objects that MUST
//! contain an `"id"` field of type `u64`. The transport uses that field for
//! routing; everything else is opaque.

mod codec;
mod transport;

pub use transport::MultiplexedTransport;

use std::fmt;
use std::sync::Arc;

/// A single frame on the wire. `id` is used for routing; `payload` is the
/// full msgpack-decoded value (including the `id` field).
#[derive(Debug, Clone)]
pub struct Frame {
    /// The request/response correlation id extracted from `payload["id"]`.
    pub id: u64,
    /// The full deserialized value. Callers are responsible for ensuring the
    /// `id` field in the payload matches this `id`.
    pub payload: serde_json::Value,
}

/// Transport-level errors. All variants are [`Clone`] so errors can be
/// broadcast to multiple waiting callers when a connection closes.
#[derive(Debug, Clone)]
pub enum TransportError {
    /// An I/O error occurred on the underlying stream (message is the
    /// original [`std::io::Error`] converted to a string to allow cloning).
    Io(Arc<std::io::Error>),
    /// A msgpack encode or decode error.
    Codec(String),
    /// The connection was closed (cleanly or otherwise) before a response
    /// arrived for this frame.
    ConnectionClosed,
    /// The incoming frame's payload length exceeded the configured maximum.
    PayloadTooLarge(usize),
}

impl fmt::Display for TransportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TransportError::Io(e) => write!(f, "IPC I/O error: {e}"),
            TransportError::Codec(s) => write!(f, "IPC codec error: {s}"),
            TransportError::ConnectionClosed => write!(f, "IPC connection closed"),
            TransportError::PayloadTooLarge(n) => {
                write!(f, "IPC frame too large: {n} bytes")
            }
        }
    }
}

impl std::error::Error for TransportError {}

impl From<std::io::Error> for TransportError {
    fn from(e: std::io::Error) -> Self {
        TransportError::Io(Arc::new(e))
    }
}
