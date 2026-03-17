use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpstreamConfig {
    pub name: String,
    pub kind: String,
    pub address: String,
    pub port: u16,
}
