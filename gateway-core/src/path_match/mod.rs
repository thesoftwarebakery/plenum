use std::{collections::BTreeMap, error::Error};
use oas3::spec::PathItem;

use matchit::Router;

use crate::{config::Upstream, upstream_http::UpstreamHttp};

pub type OpenGatewayRouter = Router<PathItem>;

pub fn build_router(paths: &BTreeMap<String, PathItem>) -> Result<OpenGatewayRouter, Box<dyn Error>> {
    let mut router = Router::new();
    for (path, path_item) in paths {
        let upsteram = Upstream::from_spec(config)
        router.insert(path, path_item.clone())?;
    }
    Ok(router)
}
