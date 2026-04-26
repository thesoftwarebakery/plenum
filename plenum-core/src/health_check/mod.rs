//! Health checking for upstream backends.
//!
//! This module provides two complementary health-tracking mechanisms:
//!
//! - **Active**: [`build_http_health_check`] creates a pingora `HttpHealthCheck` from
//!   a [`HealthCheckConfig`]. The check is attached to a `Backends` set and run
//!   periodically by a background service.
//!
//! - **Passive**: [`PassiveHealthTracker`] records proxy failures at request time and
//!   temporarily removes backends from rotation until a recovery window elapses.
//!
//! Both mechanisms are independent of load balancing — a single upstream could use
//! passive tracking for circuit-breaking, for example.

mod passive;

pub use passive::PassiveHealthTracker;

use crate::config::HealthCheckConfig;
use pingora_load_balancing::health_check::HttpHealthCheck;

/// Build a pingora [`HttpHealthCheck`] from a [`HealthCheckConfig`].
///
/// The returned health check is ready to be attached to a `Backends` set via
/// `set_health_check()`. The caller is responsible for registering the owning
/// `LoadBalancer` as a background service so the checks actually run.
pub fn build_http_health_check(
    config: &HealthCheckConfig,
    host: &str,
    tls: bool,
) -> Result<Box<HttpHealthCheck>, Box<dyn std::error::Error>> {
    let mut hc = HttpHealthCheck::new(host, tls);
    hc.consecutive_success = config.consecutive_success;
    hc.consecutive_failure = config.consecutive_failure;

    // Set the health check request path.
    hc.req.set_uri(
        config
            .path
            .as_str()
            .try_into()
            .map_err(|e| format!("invalid health check path '{}': {}", config.path, e))?,
    );

    // Set the expected status validator.
    let expected = config.expected_status;
    hc.validator = Some(Box::new(
        move |resp: &pingora_http::ResponseHeader| -> pingora_core::Result<()> {
            if resp.status.as_u16() == expected {
                Ok(())
            } else {
                Err(pingora_core::Error::explain(
                    pingora_core::ErrorType::InternalError,
                    format!(
                        "health check returned status {} (expected {})",
                        resp.status.as_u16(),
                        expected
                    ),
                ))
            }
        },
    ));

    Ok(Box::new(hc))
}
