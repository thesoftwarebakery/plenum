use std::collections::BTreeMap;

use config::{Config};
use upstream_http::*;

use path_match::{build_router,OpenGatewayRouter};

use clap::Parser;

use async_trait::async_trait;

use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_core::server::Server;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_core::Result;
use pingora_http::ResponseHeader;
use pingora_proxy::{ProxyHttp, Session};

use log::info;

mod config;
mod upstream_http;
mod path_match;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, env="OPENGATEWAY_CONFIG_PATH", help="The folder containing OpenGateway config")]
    config_path: String,

    #[arg(long, env="OPENGATEWAY_OPENAPI_SCHEMA", help="The path within the config folder to the OpenAPI schema")]
    openapi_schema: String,

    #[arg(
        long="openapi-overlay", 
        env="OPENGATEWAY_OPENAPI_OVERLAYS", 
        value_delimiter=',',
        help="The path within the config folder to any OpenAPI overlays, applied in order provided"
    )]
    openapi_overlays: Vec<String>,
}

pub struct OpenGateway {
    router: OpenGatewayRouter
}

#[async_trait]
impl ProxyHttp for OpenGateway {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(
        &self,
        session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let addr = ("1.0.0.1", 443);
        let peer = match self.router.at(session.req_header().uri.path()) {
            Ok(path_item) => {
                let method = session.req_header().method.as_str().to_lowercase();
                Box::new(HttpPeer::new(path_item[method], true, "one.one.one.one".to_string()))
            }
            Err => {
                Err("unmatched path")
            }
        }
    }
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    let config = Config::parse(&args.config_path, &args.openapi_schema, &args.openapi_overlays)
        .unwrap_or_else(|err| {
            eprintln!("Error parsing config: {}", err);
            std::process::exit(1);
        });
    let empty = BTreeMap::new();
    let paths = config.paths.as_ref().unwrap_or_else(|| {
        log::warn!("No paths defined in schema");
        &empty
    });
    let router = build_router(paths)
        .unwrap_or_else(|err| {
            eprintln!("Error constructing router: {}", err);
            std::process::exit(1);
        });

    let mut my_server = Server::new_with_opt_and_conf(
        Opt { 
            upgrade: true, 
            daemon: true, 
            test: true, 
            nocapture: true, 
            ..Opt::default() 
        }, 
        ServerConf { 
            version: 1, 
            daemon: false, 
            ..ServerConf::default() 
        });
    my_server.bootstrap();

    let mut proxy = pingora_proxy::http_proxy_service(
        &my_server.configuration,
        OpenGateway {
            router,
        }
    );
}
