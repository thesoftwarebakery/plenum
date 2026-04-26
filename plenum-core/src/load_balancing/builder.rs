//! Factory for constructing [`UpstreamPool`] instances from config types.

use std::collections::{BTreeSet, HashMap};
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use pingora_core::services::background::GenBackgroundService;
use pingora_load_balancing::selection;
use pingora_load_balancing::{Backend, Backends, LoadBalancer};

use crate::config::{BackendEntry, HealthCheckConfig, SelectionAlgorithm};
use crate::request_context::ContextRef;

use super::pool::{PoolInner, UpstreamPool};

/// Result of building an upstream pool.
pub struct PoolBuildResult {
    pub pool: UpstreamPool,
    /// Background service for active health checks. `None` when no health check is configured.
    /// Must be registered with the pingora `Server` via `add_service()`.
    pub background_service: Option<BackgroundHealthService>,
}

/// Type-erased background service for health checking.
pub enum BackgroundHealthService {
    RoundRobin(GenBackgroundService<LoadBalancer<selection::RoundRobin>>),
    Consistent(GenBackgroundService<LoadBalancer<selection::Consistent>>),
}

/// Build an [`UpstreamPool`] from config fields.
///
/// Returns the pool and an optional background service for active health checks.
pub fn build_pool(
    backends: &[BackendEntry],
    selection: SelectionAlgorithm,
    tls: bool,
    tls_verify: Option<bool>,
    hash_key: Option<&ContextRef>,
    health_check: Option<&HealthCheckConfig>,
) -> Result<PoolBuildResult, Box<dyn Error>> {
    // Resolve hostnames and build the SNI map (resolved addr → original hostname).
    let mut sni_map: HashMap<SocketAddr, String> = HashMap::new();
    let backend_set: BTreeSet<Backend> = backends
        .iter()
        .map(|b| {
            let addr_str = format!("{}:{}", b.address, b.port);
            // Resolve hostname to IP — Backend::new_with_weight only accepts numeric
            // socket addresses. ToSocketAddrs handles DNS resolution for hostnames.
            let sock_addr = std::net::ToSocketAddrs::to_socket_addrs(&addr_str.as_str())
                .map_err(|e| format!("backend '{}': DNS resolution failed: {}", addr_str, e))?
                .next()
                .ok_or_else(|| {
                    format!(
                        "backend '{}': DNS resolution returned no addresses",
                        addr_str
                    )
                })?;
            sni_map.insert(sock_addr, b.address.clone());
            Backend::new_with_weight(&sock_addr.to_string(), b.weight)
                .map_err(|e| format!("backend '{}': {}", addr_str, e))
        })
        .collect::<Result<_, _>>()?;

    let discovery = pingora_load_balancing::discovery::Static::new(backend_set);
    let mut lb_backends = Backends::new(discovery);

    // Configure active health checks if specified.
    if let Some(hc_config) = health_check {
        let host = backends
            .first()
            .map(|b| b.address.as_str())
            .unwrap_or("localhost");
        let hc = crate::health_check::build_http_health_check(hc_config, host, tls)?;
        lb_backends.set_health_check(hc);
    }

    let frequency = health_check.map(|hc| Duration::from_secs(hc.interval_seconds));
    let has_health_check = health_check.is_some();

    let (inner, bg_service) = match selection {
        SelectionAlgorithm::RoundRobin | SelectionAlgorithm::Weighted => {
            let mut lb = LoadBalancer::<selection::RoundRobin>::from_backends(lb_backends);
            lb.health_check_frequency = frequency;
            lb.parallel_health_check = true;
            let lb = Arc::new(lb);
            let bg = if has_health_check {
                Some(BackgroundHealthService::RoundRobin(
                    GenBackgroundService::new("LB health check".to_string(), lb.clone()),
                ))
            } else {
                None
            };
            (PoolInner::RoundRobin(lb), bg)
        }
        SelectionAlgorithm::Consistent => {
            let mut lb = LoadBalancer::<selection::Consistent>::from_backends(lb_backends);
            lb.health_check_frequency = frequency;
            lb.parallel_health_check = true;
            let lb = Arc::new(lb);
            let bg = if has_health_check {
                Some(BackgroundHealthService::Consistent(
                    GenBackgroundService::new("LB health check".to_string(), lb.clone()),
                ))
            } else {
                None
            };
            (PoolInner::Consistent(lb), bg)
        }
    };

    let pool = UpstreamPool::new(inner, tls, tls_verify, hash_key.cloned(), sni_map);

    Ok(PoolBuildResult {
        pool,
        background_service: bg_service,
    })
}
