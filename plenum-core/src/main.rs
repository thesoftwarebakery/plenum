use plenum_core::build_gateway;
use plenum_core::config::{Config, ServerConfig};
use plenum_core::load_balancing::builder::BackgroundHealthService;

use clap::Parser;

use pingora_core::listeners::tls::TlsSettings;
use pingora_core::server::Server;
use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_proxy::http_proxy_service;

#[derive(Parser, Debug)]
struct Args {
    #[arg(
        long,
        env = "PLENUM_CONFIG_PATH",
        help = "The folder containing Plenum config"
    )]
    config_path: String,

    #[arg(
        long,
        env = "PLENUM_OPENAPI_SCHEMA",
        help = "The path within the config folder to the OpenAPI schema"
    )]
    openapi_schema: String,

    #[arg(
        long = "openapi-overlay",
        env = "PLENUM_OPENAPI_OVERLAYS",
        value_delimiter = ',',
        help = "The path within the config folder to any OpenAPI overlays, applied in order provided"
    )]
    openapi_overlays: Vec<String>,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    let config = Config::parse(
        &args.config_path,
        &args.openapi_schema,
        &args.openapi_overlays,
    )
    .unwrap_or_else(|err| {
        eprintln!("Error parsing config: {}", err);
        std::process::exit(1);
    });

    let mut server_config: ServerConfig = config
        .extension(&config.spec.extensions, "plenum-config")
        .unwrap_or_else(|_| ServerConfig::default());

    server_config
        .resolve_paths(&args.config_path)
        .unwrap_or_else(|err| {
            eprintln!("Error in x-plenum-config: {}", err);
            std::process::exit(1);
        });

    let build_result = build_gateway(&config, &args.config_path).unwrap_or_else(|err| {
        eprintln!("Error building gateway: {}", err);
        std::process::exit(1);
    });
    let gateway = build_result.gateway;
    let bg_services = build_result.background_services;

    let conf = ServerConf {
        threads: server_config.threads,
        daemon: server_config.daemon,
        ca_file: server_config.ca_file.clone(),
        ..ServerConf::default()
    };

    let mut my_server = Server::new_with_opt_and_conf(Opt::default(), conf);
    my_server.bootstrap();

    let mut proxy = http_proxy_service(&my_server.configuration, gateway);
    proxy.add_tcp(&server_config.listen);

    if let Some(tls_config) = &server_config.tls {
        match TlsSettings::intermediate(&tls_config.cert_path, &tls_config.key_path) {
            Ok(mut settings) => {
                settings.enable_h2();
                proxy.add_tls_with_settings(&tls_config.listen, None, settings);
                log::info!("TLS listener on {}", tls_config.listen);
            }
            Err(e) => {
                eprintln!("Error configuring TLS listener: {}", e);
                std::process::exit(1);
            }
        }
    }

    my_server.add_service(proxy);

    // Register load-balancing health check background services.
    for svc in bg_services {
        match svc {
            BackgroundHealthService::RoundRobin(s) => {
                my_server.add_service(s);
            }
            BackgroundHealthService::Consistent(s) => {
                my_server.add_service(s);
            }
        }
    }

    my_server.run_forever();
}
