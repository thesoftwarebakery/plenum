use gateway_core::config::{Config, ServerConfig};
use gateway_core::build_gateway;

use clap::Parser;

use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_core::server::Server;
use pingora_proxy::http_proxy_service;

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

fn main() {
    env_logger::init();
    let args = Args::parse();

    let config = Config::parse(&args.config_path, &args.openapi_schema, &args.openapi_overlays)
        .unwrap_or_else(|err| {
            eprintln!("Error parsing config: {}", err);
            std::process::exit(1);
        });

    let server_config: ServerConfig = config
        .extension(&config.spec.extensions, "opengateway-config")
        .unwrap_or_else(|_| ServerConfig::default());

    let gateway = build_gateway(&config, &args.config_path)
        .unwrap_or_else(|err| {
            eprintln!("Error building gateway: {}", err);
            std::process::exit(1);
        });

    let conf = ServerConf {
        threads: server_config.threads,
        daemon: server_config.daemon,
        ..ServerConf::default()
    };

    let mut my_server = Server::new_with_opt_and_conf(Opt::default(), conf);
    my_server.bootstrap();

    let mut proxy = http_proxy_service(&my_server.configuration, gateway);
    proxy.add_tcp(&server_config.listen);
    my_server.add_service(proxy);
    my_server.run_forever();
}
