use plenum_core::build_gateway;
use plenum_core::config::{Config, ServerConfig, resolve_env_vars};

use clap::Parser;

use pingora_core::server::Server;
use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_proxy::http_proxy_service;

use pingora_core::listeners::tls::TlsSettings;

use std::path::Path;

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

/// Apply env var substitution (`${VAR}` / `${VAR:-default}`) to a path string.
fn expand_env_in_path(s: String, field: &str) -> String {
    match resolve_env_vars(serde_json::Value::String(s)) {
        Ok(v) => v.as_str().unwrap_or("").to_string(),
        Err(e) => {
            eprintln!("Error in x-plenum-config {}: {}", field, e);
            std::process::exit(1);
        }
    }
}

/// Resolve a path relative to config_base if it is not already absolute.
fn resolve_config_path(s: String, config_base: &str) -> String {
    let p = Path::new(&s);
    if p.is_absolute() {
        s
    } else {
        Path::new(config_base)
            .join(p)
            .to_string_lossy()
            .into_owned()
    }
}

/// Exit with a clear message if a required file does not exist.
fn require_file(path: &str, label: &str) {
    if !Path::new(path).exists() {
        eprintln!("Error: {} not found: {}", label, path);
        std::process::exit(1);
    }
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

    // Apply env var substitution and path resolution to TLS path fields.
    if let Some(tls) = server_config.tls.as_mut() {
        tls.cert_path = resolve_config_path(
            expand_env_in_path(tls.cert_path.clone(), "tls.cert_path"),
            &args.config_path,
        );
        tls.key_path = resolve_config_path(
            expand_env_in_path(tls.key_path.clone(), "tls.key_path"),
            &args.config_path,
        );
        require_file(&tls.cert_path, "tls.cert_path");
        require_file(&tls.key_path, "tls.key_path");
    }
    if let Some(ca_file) = server_config.ca_file.as_mut() {
        *ca_file = resolve_config_path(
            expand_env_in_path(ca_file.clone(), "ca_file"),
            &args.config_path,
        );
        require_file(ca_file, "ca_file");
    }

    let gateway = build_gateway(&config, &args.config_path).unwrap_or_else(|err| {
        eprintln!("Error building gateway: {}", err);
        std::process::exit(1);
    });

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
    my_server.run_forever();
}
