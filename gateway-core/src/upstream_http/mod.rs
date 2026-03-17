use crate::config::UpstreamConfig;
use pingora_core::upstreams::peer::HttpPeer;

pub fn make_peer(config: &UpstreamConfig) -> HttpPeer {
    HttpPeer::new(
        (config.address.as_str(), config.port),
        false,
        config.address.clone(),
    )
}
