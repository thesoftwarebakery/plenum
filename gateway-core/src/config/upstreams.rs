use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpstreamConfig {
    pub kind: String,
    pub address: String,
    pub port: u16,
}
