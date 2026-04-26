//! Passive health tracking via proxy failure observation.
//!
//! [`PassiveHealthTracker`] records backend failures reported by `fail_to_proxy`
//! and temporarily removes them from rotation until a recovery window elapses.
//! This is independent of active health checks — it can be used standalone for
//! circuit-breaking on single upstreams or alongside active checks for faster
//! failure detection between health check intervals.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use parking_lot::RwLock;

/// Default recovery window: how long a backend stays out of rotation after a failure.
const DEFAULT_RECOVERY_SECONDS: u64 = 30;

/// Tracks backend failures and provides a readiness check with time-based recovery.
///
/// Thread-safe — designed to be shared across request-handling threads via `Arc`.
pub struct PassiveHealthTracker {
    /// Maps backend addr → most recent failure timestamp.
    failures: RwLock<HashMap<SocketAddr, Instant>>,
    recovery: Duration,
}

impl PassiveHealthTracker {
    /// Create a new tracker with the default recovery window (30 seconds).
    pub fn new() -> Self {
        Self {
            failures: RwLock::new(HashMap::new()),
            recovery: Duration::from_secs(DEFAULT_RECOVERY_SECONDS),
        }
    }

    /// Record a backend failure. The backend is removed from rotation until the
    /// recovery window elapses.
    pub fn report_failure(&self, addr: &SocketAddr) {
        let mut failures = self.failures.write();
        failures.insert(*addr, Instant::now());
    }

    /// Returns `true` if no backends are currently marked as failed.
    ///
    /// This is a cheap read-lock check intended as a fast-path gate — callers
    /// can skip the more expensive [`is_healthy`] check when there are no
    /// failures at all.
    pub fn is_empty(&self) -> bool {
        self.failures.read().is_empty()
    }

    /// Returns `true` if the given backend is healthy (not in the failure map,
    /// or its recovery window has elapsed).
    ///
    /// Does **not** clean up expired entries — call [`cleanup`] periodically
    /// or when transitioning from non-empty to the cleanup path.
    pub fn is_healthy(&self, addr: &SocketAddr) -> bool {
        let failures = self.failures.read();
        match failures.get(addr) {
            None => true,
            Some(ts) => ts.elapsed() >= self.recovery,
        }
    }

    /// Remove expired entries from the failure map. Returns `true` if the map
    /// is now empty (all backends recovered).
    pub fn cleanup(&self) -> bool {
        let mut failures = self.failures.write();
        failures.retain(|_, ts| ts.elapsed() < self.recovery);
        failures.is_empty()
    }
}

impl Default for PassiveHealthTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_tracker_is_empty() {
        let tracker = PassiveHealthTracker::new();
        assert!(tracker.is_empty());
    }

    #[test]
    fn report_failure_marks_backend_unhealthy() {
        let tracker = PassiveHealthTracker::new();
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();

        tracker.report_failure(&addr);

        assert!(!tracker.is_empty());
        assert!(!tracker.is_healthy(&addr));
    }

    #[test]
    fn unknown_backend_is_healthy() {
        let tracker = PassiveHealthTracker::new();
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();

        assert!(tracker.is_healthy(&addr));
    }

    #[test]
    fn cleanup_removes_expired_entries() {
        let tracker = PassiveHealthTracker {
            failures: RwLock::new(HashMap::new()),
            recovery: Duration::from_millis(10),
        };
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();

        tracker.report_failure(&addr);
        assert!(!tracker.is_empty());

        std::thread::sleep(Duration::from_millis(15));

        assert!(tracker.cleanup());
        assert!(tracker.is_empty());
    }

    #[test]
    fn is_healthy_respects_recovery_window() {
        let tracker = PassiveHealthTracker {
            failures: RwLock::new(HashMap::new()),
            recovery: Duration::from_millis(10),
        };
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();

        tracker.report_failure(&addr);
        assert!(!tracker.is_healthy(&addr));

        std::thread::sleep(Duration::from_millis(15));

        assert!(tracker.is_healthy(&addr));
    }
}
