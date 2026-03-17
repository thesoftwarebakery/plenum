use std::collections::BTreeMap;
use std::error::Error;

use oas3::spec::PathItem;
use matchit::Router;

use crate::config::Config;

pub type OpenGatewayRouter = Router<String>;

pub fn build_router(
    config: &Config,
    paths: &BTreeMap<String, PathItem>,
) -> Result<OpenGatewayRouter, Box<dyn Error>> {
    let mut router = Router::new();
    for (path, path_item) in paths {
        let upstream_name: String = config.extension(&path_item.extensions, "opengateway-upstream")?;
        router.insert(path, upstream_name)?;
    }
    Ok(router)
}
