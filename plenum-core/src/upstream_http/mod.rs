use pingora_core::upstreams::peer::HttpPeer;

pub fn make_peer(address: &str, port: u16, tls: bool, tls_verify: Option<bool>) -> HttpPeer {
    let sni = address.to_string();
    let mut peer = HttpPeer::new((address, port), tls, sni);
    if tls {
        let verify = tls_verify.unwrap_or(true);
        peer.options.verify_cert = verify;
        peer.options.verify_hostname = verify;
    }
    peer
}
