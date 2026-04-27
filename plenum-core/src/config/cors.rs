use serde::Deserialize;

/// Per-operation CORS configuration parsed from `x-plenum-cors`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CorsConfig {
    /// Allowed origins. Required — no CORS headers without this.
    /// Each entry can be:
    /// - `"*"` to allow any origin (incompatible with `allow_credentials: true`)
    /// - An exact origin: `"https://example.com"`
    /// - A wildcard prefix: `"*.example.com"` (matches any subdomain)
    pub origins: Vec<String>,
    /// Allowed HTTP methods. Defaults to GET, POST, HEAD.
    #[serde(default = "default_methods")]
    pub methods: Vec<String>,
    /// Allowed request headers. Empty = only simple headers allowed.
    #[serde(default)]
    pub headers: Vec<String>,
    /// Whether credentials (cookies, auth headers) are allowed.
    #[serde(default)]
    pub allow_credentials: bool,
    /// Preflight cache max-age in seconds. Defaults to 86400 (24h).
    #[serde(default = "default_max_age")]
    pub max_age: u32,
    /// Response headers exposed to the browser.
    #[serde(default)]
    pub expose_headers: Vec<String>,
}

fn default_methods() -> Vec<String> {
    vec!["GET".into(), "POST".into(), "HEAD".into()]
}

fn default_max_age() -> u32 {
    86400
}
