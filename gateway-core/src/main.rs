use std::collections::{BTreeMap, HashMap};

use config::{Config, ServerConfig, UpstreamConfig};
use path_match::build_router;
use upstream_http::make_peer;

use clap::Parser;

use async_trait::async_trait;
use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_core::server::Server;
use pingora_core::upstreams::peer::HttpPeer;
use pingora_proxy::{ProxyHttp, Session, http_proxy_service};

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

fn main() {
    env_logger::init();
    let args = Args::parse();

    let config = Config::parse(&args.config_path, &args.openapi_schema, &args.openapi_overlays)
        .unwrap_or_else(|err| {
            eprintln!("Error parsing config: {}", err);
            std::process::exit(1);
        });

    let empty = BTreeMap::new();
    let paths = config.spec.paths.as_ref().unwrap_or_else(|| {
        log::warn!("No paths defined in schema");
        &empty
    });

    let router = build_router(&config, paths)
        .unwrap_or_else(|err| {
            eprintln!("Error constructing router: {}", err);
            std::process::exit(1);
        });

    let server_config: ServerConfig = config
        .extension(&config.spec.extensions, "opengateway-config")
        .unwrap_or_else(|_| ServerConfig::default());

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

    let conf = ServerConf {
        threads: server_config.threads,
        daemon: server_config.daemon,
        ..ServerConf::default()
    };

    let mut my_server = Server::new_with_opt_and_conf(Opt::default(), conf);
    my_server.bootstrap();

    let gateway = OpenGateway { router, peers };
    let mut proxy = http_proxy_service(&my_server.configuration, gateway);
    proxy.add_tcp(&server_config.listen);
    my_server.add_service(proxy);
    my_server.run_forever();
}
