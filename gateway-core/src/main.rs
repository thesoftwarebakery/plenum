use std::env::var;
use config::Config;

mod config;

fn main() {
    let config_path = var("OPENAPI_CONFIG").unwrap();
    let overlays_path = var("OVERLAYS_PATH").unwrap();
    let overlays: Vec<&str> = overlays_path.split(",").collect();
    let config = Config::parse(&config_path, &overlays);

    println!("{:#?}", config.extensions);
}
