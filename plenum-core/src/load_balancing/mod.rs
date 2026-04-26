//! Load balancing for multi-upstream HTTP routes.
//!
//! This module provides [`UpstreamPool`] — a wrapper around `pingora-load-balancing`
//! that manages backend selection, active health checks, and passive failure tracking
//! for HTTP upstream pools.
//!
//! Use [`builder::build_pool`] to construct an [`UpstreamPool`] from config types.

pub mod builder;
mod pool;

pub use builder::build_pool;
pub use pool::UpstreamPool;
