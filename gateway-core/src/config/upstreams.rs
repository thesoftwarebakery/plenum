use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpstreamConfig {
    pub kind: String,
    pub address: String,
    pub port: u16,
    #[serde(default, rename = "buffer-response")]
    pub buffer_response: bool,
}
