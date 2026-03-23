use std::collections::BTreeMap;
use std::error::Error;

use config::Config;
use path_match::build_router;

use async_trait::async_trait;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session};

pub mod config;
pub mod upstream_http;
pub mod path_match;

pub struct OpenGateway {
    router: path_match::OpenGatewayRouter,
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
        Ok(Box::new(matched.value.clone()))
    }
}

pub fn build_gateway(config: &Config) -> Result<OpenGateway, Box<dyn Error>> {
    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or(&empty);

    let router = build_router(config, paths)?;

    Ok(OpenGateway { router })
}
