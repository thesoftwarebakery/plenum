use std::collections::BTreeMap;
use std::error::Error;
use std::sync::Arc;

use oas3::spec::PathItem;
use matchit::Router;
use pingora_core::upstreams::peer::HttpPeer;

use crate::config::Config;
use crate::config::UpstreamConfig;
use crate::upstream_http::make_peer;

pub struct RouteEntry {
    pub peer: HttpPeer,
}

pub type OpenGatewayRouter = Router<Arc<RouteEntry>>;

pub fn build_router(
    config: &Config,
    paths: &BTreeMap<String, PathItem>,
) -> Result<OpenGatewayRouter, Box<dyn Error>> {
    let mut router = Router::new();
    for (path, path_item) in paths {
        let upstream: UpstreamConfig = config.extension(&path_item.extensions, "opengateway-upstream")?;
        let peer = make_peer(&upstream);
        let entry = Arc::new(RouteEntry { peer });
        router.insert(path, entry)?;
    }
    Ok(router)
}
