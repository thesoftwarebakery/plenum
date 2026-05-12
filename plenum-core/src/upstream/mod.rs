mod builder;

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use pingora_core::upstreams::peer::HttpPeer;
use plenum_js_runtime::PluginRuntime;

use crate::load_balancing::UpstreamPool;

pub(crate) use builder::PluginRuntimeKey;
pub(crate) use builder::build_upstream;

/// Handle to a spawned backend plugin runtime (Node.js out-of-process).
pub struct PluginHandle {
    pub runtime: Arc<dyn PluginRuntime>,
    pub timeout: Duration,
    /// When true, the plugin's `handle()` function returns an async generator
    /// and response chunks are streamed to the client as they arrive.
    pub streaming: bool,
}

impl std::fmt::Debug for PluginHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginHandle")
            .field("timeout", &self.timeout)
            .finish_non_exhaustive()
    }
}

/// Pre-built static response, ready to write directly to the downstream session.
#[derive(Debug)]
pub struct StaticResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Bytes,
}

/// The upstream target for a route -- either an HTTP peer, a Node.js backend plugin,
/// a pre-built static response, or not configured (returns 501 at request time).
#[derive(Debug)]
pub enum Upstream {
    Http(Box<HttpPeer>),
    HttpPool(Arc<UpstreamPool>),
    Plugin(PluginHandle),
    Static(StaticResponse),
    /// No upstream configured for this route. Requests receive a 501 Not Implemented
    /// response after interceptors have had a chance to short-circuit.
    NotConfigured,
}
