use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct InterceptorConfig {
    pub module: String,
    pub hooks: Vec<String>,
}
