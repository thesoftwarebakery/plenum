use crate::config::{Upstream};
use pingora_core::upstreams::peer::HttpPeer;
use pingora_core::Result;

pub struct UpstreamHttp {
    hostname: String,
    port: u16,
}

impl UpstreamHttp {
    pub fn from_upstream_config(upstream_config: &Upstream) -> Self {
        UpstreamHttp { 
            hostname: upstream_config.address.clone(), 
            port:  upstream_config.port.clone(),
        }
    }

    pub fn new(&self) -> Result<Box<HttpPeer>> {
        let addr = (self.hostname.clone(), self.port);
        Ok(Box::new(HttpPeer::new(addr, false, self.hostname.clone())))
    }
}
