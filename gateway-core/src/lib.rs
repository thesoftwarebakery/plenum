use std::collections::{BTreeMap, HashMap};
use std::error::Error;

use config::{Config, UpstreamConfig};
use path_match::build_router;
use upstream_http::make_peer;

use async_trait::async_trait;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};

pub mod config;
pub mod upstream_http;
pub mod path_match;

pub struct OpenGateway {
    router: path_match::OpenGatewayRouter,
    peers: HashMap<String, HttpPeer>,
}

#[async_trait]
impl ProxyHttp for OpenGateway {
    type CTX = ();

    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(
        &self,
        session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> pingora_core::Result<Box<HttpPeer>> {
        let path = session.req_header().uri.path();
        let matched = self.router.at(path).map_err(|e| {
            log::warn!("No route matched for path: {}", path);
            pingora_core::Error::because(
                pingora_core::ErrorType::HTTPStatus(404),
                "no matching route",
                e,
            )
        })?;
        let upstream_name = matched.value;
        let peer = self.peers.get(upstream_name.as_str()).ok_or_else(|| {
            log::error!("Upstream '{}' not found in peer registry", upstream_name);
            pingora_core::Error::new(pingora_core::ErrorType::InternalError)
        })?;
        Ok(Box::new(peer.clone()))
    }
}

pub fn build_gateway(config: &Config) -> Result<OpenGateway, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);

    let router = build_router(config, paths)?;

    let upstreams: Vec<UpstreamConfig> = config
        .extension(&config.spec.extensions, "opengateway-upstreams")
        .unwrap_or_else(|err| {
            log::warn!("No upstreams defined: {}", err);
            Vec::new()
        });

    let mut peers = HashMap::new();
    for upstream in &upstreams {
        let peer = make_peer(upstream);
        peers.insert(upstream.name.clone(), peer);
    }

    Ok(OpenGateway { router, peers })
}
