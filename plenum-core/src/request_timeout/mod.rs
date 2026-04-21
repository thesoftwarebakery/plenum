use std::time::{Duration, Instant};

use pingora_core::upstreams::peer::HttpPeer;

/// Compute time remaining from `start` against the configured `timeout`.
/// Returns `None` if the budget is exhausted.
pub fn remaining_budget(start: Instant, timeout: Duration) -> Option<Duration> {
    let remaining = timeout.saturating_sub(start.elapsed());
    if remaining.is_zero() {
        None
    } else {
        Some(remaining)
    }
}

/// Set connection, total-connection, and read timeouts on an `HttpPeer` to the
/// remaining request budget. Returns an error if the budget is already exhausted.
pub fn apply_to_peer(
    peer: &mut HttpPeer,
    start: Instant,
    timeout: Duration,
) -> pingora_core::Result<()> {
    let remaining = remaining_budget(start, timeout).ok_or_else(|| {
        pingora_core::Error::explain(
            pingora_core::ErrorType::ConnectTimedout,
            "request timeout exceeded before upstream connection",
        )
    })?;
    peer.options.connection_timeout = Some(remaining);
    peer.options.total_connection_timeout = Some(remaining);
    peer.options.read_timeout = Some(remaining);
    Ok(())
}

/// Effective timeout for a single interceptor call: the minimum of the remaining
/// request budget and the per-interceptor timeout. Returns `None` if the budget
/// is exhausted (caller should cancel the request).
pub fn effective_interceptor_timeout(
    start: Instant,
    request_timeout: Duration,
    interceptor_timeout: Duration,
) -> Option<Duration> {
    remaining_budget(start, request_timeout).map(|budget| budget.min(interceptor_timeout))
}

/// Returns `true` when the error is a connect or read timeout from the upstream.
pub fn is_timeout_error(e: &pingora_core::Error) -> bool {
    matches!(
        e.etype(),
        pingora_core::ErrorType::ConnectTimedout | pingora_core::ErrorType::ReadTimedout
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn remaining_budget_returns_some_when_within_timeout() {
        let start = Instant::now();
        let timeout = Duration::from_secs(10);
        let budget = remaining_budget(start, timeout);
        assert!(budget.is_some());
        assert!(budget.unwrap() <= timeout);
    }

    #[test]
    fn remaining_budget_returns_none_when_expired() {
        let start = Instant::now() - Duration::from_secs(5);
        let timeout = Duration::from_secs(1);
        assert!(remaining_budget(start, timeout).is_none());
    }

    #[test]
    fn remaining_budget_subtracts_elapsed() {
        let start = Instant::now();
        thread::sleep(Duration::from_millis(50));
        let timeout = Duration::from_secs(1);
        let budget = remaining_budget(start, timeout).unwrap();
        assert!(budget < timeout);
        assert!(budget >= Duration::from_millis(900));
    }

    #[test]
    fn apply_to_peer_sets_all_timeouts() {
        let start = Instant::now();
        let timeout = Duration::from_secs(10);
        let mut peer = HttpPeer::new("127.0.0.1:8080", false, String::new());
        apply_to_peer(&mut peer, start, timeout).unwrap();
        assert!(peer.options.connection_timeout.is_some());
        assert!(peer.options.total_connection_timeout.is_some());
        assert!(peer.options.read_timeout.is_some());
    }

    #[test]
    fn apply_to_peer_returns_error_when_expired() {
        let start = Instant::now() - Duration::from_secs(5);
        let timeout = Duration::from_secs(1);
        let mut peer = HttpPeer::new("127.0.0.1:8080", false, String::new());
        let result = apply_to_peer(&mut peer, start, timeout);
        assert!(result.is_err());
    }

    #[test]
    fn effective_interceptor_timeout_returns_none_when_budget_exhausted() {
        let start = Instant::now() - Duration::from_secs(5);
        let request_timeout = Duration::from_secs(1);
        let interceptor_timeout = Duration::from_secs(30);
        assert!(
            effective_interceptor_timeout(start, request_timeout, interceptor_timeout).is_none()
        );
    }

    #[test]
    fn effective_interceptor_timeout_returns_min_of_budget_and_interceptor() {
        let start = Instant::now();
        let request_timeout = Duration::from_secs(2);
        let interceptor_timeout = Duration::from_secs(30);
        let effective =
            effective_interceptor_timeout(start, request_timeout, interceptor_timeout).unwrap();
        // Budget (~2s) is less than interceptor timeout (30s), so effective ≈ budget
        assert!(effective <= Duration::from_secs(2));
        assert!(effective > Duration::from_secs(1));
    }

    #[test]
    fn effective_interceptor_timeout_uses_interceptor_when_budget_larger() {
        let start = Instant::now();
        let request_timeout = Duration::from_secs(60);
        let interceptor_timeout = Duration::from_millis(500);
        let effective =
            effective_interceptor_timeout(start, request_timeout, interceptor_timeout).unwrap();
        assert_eq!(effective, Duration::from_millis(500));
    }

    #[test]
    fn is_timeout_error_matches_connect_timeout() {
        let e = pingora_core::Error::new(pingora_core::ErrorType::ConnectTimedout);
        assert!(is_timeout_error(&e));
    }

    #[test]
    fn is_timeout_error_matches_read_timeout() {
        let e = pingora_core::Error::new(pingora_core::ErrorType::ReadTimedout);
        assert!(is_timeout_error(&e));
    }

    #[test]
    fn is_timeout_error_rejects_other_errors() {
        let e = pingora_core::Error::new(pingora_core::ErrorType::InternalError);
        assert!(!is_timeout_error(&e));
    }
}
