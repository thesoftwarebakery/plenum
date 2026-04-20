use pingora_core::upstreams::peer::HttpPeer;

pub fn make_peer(address: &str, port: u16) -> HttpPeer {
    HttpPeer::new((address, port), false, address.to_string())
}
