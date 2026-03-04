use config::Config;
use clap::Parser;

mod config;

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
    let args = Args::parse();

    match Config::parse(&args.config_path, &args.openapi_schema, &args.openapi_overlays) {
        Ok(val) => println!("{:#?}", val.extensions),
        Err(err) => eprintln!("Error parsing config: {}", err)
    }
}
