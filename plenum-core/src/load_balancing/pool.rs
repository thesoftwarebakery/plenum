//! The core [`UpstreamPool`] type and backend selection logic.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use pingora_core::upstreams::peer::HttpPeer;
use pingora_load_balancing::LoadBalancer;
use pingora_load_balancing::selection;

use crate::health_check::PassiveHealthTracker;
use crate::request_context::{ContextRef, ExtractionCtx};

/// Maps a resolved `SocketAddr` back to the original hostname configured for that
/// backend. Used to set TLS SNI correctly (SNI must be the hostname, not the IP).
type SniMap = HashMap<SocketAddr, String>;

/// Selection algorithm dispatcher, type-erasing the generic `LoadBalancer<S>`.
pub(super) enum PoolInner {
    RoundRobin(Arc<LoadBalancer<selection::RoundRobin>>),
    Consistent(Arc<LoadBalancer<selection::Consistent>>),
}

/// Default number of iterations before giving up on finding a healthy backend.
const MAX_SELECT_ITERATIONS: usize = 256;

/// A pool of HTTP backends with load-balanced selection and health tracking.
///
/// Wraps `pingora-load-balancing` and adds:
/// - Transparent hash-key extraction for consistent hashing
/// - Passive failure tracking with time-based recovery
/// - TLS configuration shared across all backends
pub struct UpstreamPool {
    pub(super) inner: PoolInner,
    pub(super) tls: bool,
    pub(super) tls_verify: Option<bool>,
    pub(super) hash_key_source: Option<ContextRef>,
    /// Maps resolved socket addresses back to original hostnames for TLS SNI.
    pub(super) sni_map: SniMap,
    passive: PassiveHealthTracker,
}

impl std::fmt::Debug for UpstreamPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("UpstreamPool")
            .field("tls", &self.tls)
            .field(
                "algorithm",
                match &self.inner {
                    PoolInner::RoundRobin(_) => &"round-robin/weighted",
                    PoolInner::Consistent(_) => &"consistent",
                },
            )
            .finish_non_exhaustive()
    }
}

impl UpstreamPool {
    pub(super) fn new(
        inner: PoolInner,
        tls: bool,
        tls_verify: Option<bool>,
        hash_key_source: Option<ContextRef>,
        sni_map: SniMap,
    ) -> Self {
        Self {
            inner,
            tls,
            tls_verify,
            hash_key_source,
            sni_map,
            passive: PassiveHealthTracker::new(),
        }
    }

    /// Select the next healthy backend and return an [`HttpPeer`].
    ///
    /// For consistent hashing, the hash key is extracted from the request using the
    /// configured `${{...}}` context reference. For round-robin / weighted, the key
    /// is empty (ignored by the algorithm).
    ///
    /// Returns `None` if no healthy backend is available.
    pub fn select(
        &self,
        req: &pingora_http::RequestHeader,
        path_params: &HashMap<String, String>,
    ) -> Option<(Box<HttpPeer>, SocketAddr)> {
        let key = match &self.hash_key_source {
            Some(ctx_ref) => ctx_ref
                .extract(&ExtractionCtx {
                    req,
                    path_params,
                    user_ctx: None,
                    peer_addr: None,
                })
                .unwrap_or_default()
                .into_bytes(),
            None => vec![],
        };

        let backend = self.select_with_passive_filter(&key)?;

        // Extract the std::net::SocketAddr from the pingora SocketAddr.
        let std_addr = backend
            .addr
            .as_inet()
            .copied()
            .unwrap_or_else(|| SocketAddr::from(([0, 0, 0, 0], 0)));

        // Use the original hostname for SNI (not the resolved IP), so TLS
        // certificate verification works against domain-issued certs.
        let sni = self
            .sni_map
            .get(&std_addr)
            .cloned()
            .unwrap_or_else(|| std_addr.ip().to_string());
        let mut peer = HttpPeer::new(std_addr, self.tls, sni);
        if self.tls {
            let verify = self.tls_verify.unwrap_or(true);
            peer.options.verify_cert = verify;
            peer.options.verify_hostname = verify;
        }

        Some((Box::new(peer), std_addr))
    }

    /// Select a backend, filtering out passively-failed backends that haven't
    /// recovered yet.
    fn select_with_passive_filter(&self, key: &[u8]) -> Option<pingora_load_balancing::Backend> {
        // Fast path (common case): no passive failures recorded — read lock only.
        if self.passive.is_empty() {
            return match &self.inner {
                PoolInner::RoundRobin(lb) => lb.select(key, MAX_SELECT_ITERATIONS),
                PoolInner::Consistent(lb) => lb.select(key, MAX_SELECT_ITERATIONS),
            };
        }

        // There are passive failures — clean up expired entries first.
        if self.passive.cleanup() {
            // All entries expired — back to the fast path.
            return match &self.inner {
                PoolInner::RoundRobin(lb) => lb.select(key, MAX_SELECT_ITERATIONS),
                PoolInner::Consistent(lb) => lb.select(key, MAX_SELECT_ITERATIONS),
            };
        }

        // Slow path: filter out passively-failed backends.
        let accept = |backend: &pingora_load_balancing::Backend, healthy: bool| -> bool {
            let std_addr = backend.addr.as_inet().copied();
            match std_addr {
                Some(addr) => healthy && self.passive.is_healthy(&addr),
                None => healthy,
            }
        };
        match &self.inner {
            PoolInner::RoundRobin(lb) => lb.select_with(key, MAX_SELECT_ITERATIONS, accept),
            PoolInner::Consistent(lb) => lb.select_with(key, MAX_SELECT_ITERATIONS, accept),
        }
    }

    /// Report a backend failure for passive health tracking.
    ///
    /// The backend is temporarily removed from rotation for the passive recovery window.
    pub fn report_failure(&self, addr: &SocketAddr) {
        self.passive.report_failure(addr);
    }
}
