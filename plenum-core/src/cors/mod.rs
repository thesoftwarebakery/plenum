//! CORS handling module.
//!
//! Self-contained module that handles CORS behaviour for both request and response phases.
//! Called from `request_filter` (preflight short-circuit) and `response_filter` (CORS headers
//! on actual responses).

use crate::config::CorsConfig;
use http::header::HeaderValue;
use pingora_http::ResponseHeader;
use pingora_proxy::Session;

/// Result of handling a CORS preflight request.
pub enum PreflightResult {
    /// Preflight was handled; the caller should return `true` from `request_filter`.
    Handled,
    /// Preflight was not applicable; the caller should continue normal processing.
    NotHandled,
}

/// Check if the request origin matches the CORS config.
///
/// Supports exact matches and wildcard prefix patterns (e.g., `*.example.com`).
pub fn origin_matches(origin: &str, config: &CorsConfig) -> bool {
    config.origins.iter().any(|pattern| {
        if pattern == "*" {
            true
        } else if let Some(suffix) = pattern.strip_prefix('*') {
            origin.ends_with(suffix)
        } else {
            pattern == origin
        }
    })
}

/// Validate config at boot time. Returns error for invalid combinations.
pub fn validate_cors_config(config: &CorsConfig) -> Result<(), String> {
    if config.allow_credentials && config.origins.iter().any(|o| o == "*") {
        return Err(
            "CORS: `allow_credentials: true` is incompatible with `origins: [\"*\"]`. \
             Use an explicit origin list instead."
                .into(),
        );
    }
    Ok(())
}

/// Handle a CORS preflight (OPTIONS) request.
///
/// If the request is OPTIONS, has an Origin header, and CORS is configured for this
/// operation, writes a 204 response with CORS headers and returns `Handled`.
/// Otherwise returns `NotHandled` so the caller continues normal processing.
pub async fn handle_preflight(
    session: &mut Session,
    cors_config: &CorsConfig,
) -> pingora_core::Result<PreflightResult> {
    let origin = match session
        .req_header()
        .headers
        .get(http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        Some(o) => o,
        None => return Ok(PreflightResult::NotHandled),
    };

    if !origin_matches(origin, cors_config) {
        return Ok(PreflightResult::NotHandled);
    }

    let mut resp = ResponseHeader::build(204, None).map_err(|e| {
        pingora_core::Error::because(
            pingora_core::ErrorType::InternalError,
            "build CORS preflight response",
            e,
        )
    })?;

    add_cors_headers(&mut resp, cors_config, origin);
    add_preflight_headers(&mut resp, cors_config);

    session
        .write_response_header(Box::new(resp), true)
        .await
        .map_err(|e| {
            pingora_core::Error::because(
                pingora_core::ErrorType::InternalError,
                "write CORS preflight response",
                e,
            )
        })?;

    Ok(PreflightResult::Handled)
}

/// Add CORS headers to a response (non-preflight).
///
/// Adds `Access-Control-Allow-Origin` and, when configured,
/// `Access-Control-Allow-Credentials` and `Access-Control-Expose-Headers`.
pub fn add_cors_headers_to_response(
    resp: &mut ResponseHeader,
    cors_config: &CorsConfig,
    session: &Session,
) {
    let origin = match session
        .req_header()
        .headers
        .get(http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        Some(o) => o,
        None => return,
    };

    if !origin_matches(origin, cors_config) {
        return;
    }

    add_cors_headers(resp, cors_config, origin);
}

/// Add all CORS headers to a response.
fn add_cors_headers(resp: &mut ResponseHeader, config: &CorsConfig, request_origin: &str) {
    // Access-Control-Allow-Origin: exact origin (never "*" when credentials)
    if let Ok(val) = HeaderValue::from_str(request_origin) {
        let _ = resp.insert_header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, val);
    }

    // Vary: Origin — required so caches don't serve one origin's CORS headers to another.
    let _ = resp.append_header(http::header::VARY, HeaderValue::from_static("Origin"));

    // Access-Control-Allow-Credentials
    if config.allow_credentials {
        let _ = resp.insert_header(
            http::header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
            HeaderValue::from_static("true"),
        );
    }

    // Access-Control-Expose-Headers
    if !config.expose_headers.is_empty() {
        let joined = config.expose_headers.join(", ");
        if let Ok(val) = HeaderValue::from_str(&joined) {
            let _ = resp.insert_header(http::header::ACCESS_CONTROL_EXPOSE_HEADERS, val);
        }
    }
}

/// Add preflight-specific headers (methods, headers, max-age).
fn add_preflight_headers(resp: &mut ResponseHeader, config: &CorsConfig) {
    // Access-Control-Allow-Methods
    let methods = config.methods.join(", ");
    if let Ok(val) = HeaderValue::from_str(&methods) {
        let _ = resp.insert_header(http::header::ACCESS_CONTROL_ALLOW_METHODS, val);
    }

    // Access-Control-Allow-Headers
    if !config.headers.is_empty() {
        let joined = config.headers.join(", ");
        if let Ok(val) = HeaderValue::from_str(&joined) {
            let _ = resp.insert_header(http::header::ACCESS_CONTROL_ALLOW_HEADERS, val);
        }
    }

    // Access-Control-Max-Age
    let _ = resp.insert_header(
        http::header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_str(&config.max_age.to_string()).unwrap(),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_any() -> CorsConfig {
        CorsConfig {
            origins: vec!["*".into()],
            methods: vec!["GET".into(), "POST".into()],
            headers: vec![],
            allow_credentials: false,
            max_age: 3600,
            expose_headers: vec![],
        }
    }

    fn config_list() -> CorsConfig {
        CorsConfig {
            origins: vec![
                "https://example.com".into(),
                "https://app.example.com".into(),
            ],
            methods: vec!["GET".into(), "POST".into(), "PUT".into()],
            headers: vec!["Content-Type".into(), "Authorization".into()],
            allow_credentials: true,
            max_age: 7200,
            expose_headers: vec!["X-Request-Id".into()],
        }
    }

    fn config_glob() -> CorsConfig {
        CorsConfig {
            origins: vec!["*.example.com".into()],
            methods: vec!["GET".into()],
            headers: vec![],
            allow_credentials: false,
            max_age: 3600,
            expose_headers: vec![],
        }
    }

    #[test]
    fn origin_matches_any() {
        let config = config_any();
        assert!(origin_matches("https://anything.com", &config));
        assert!(origin_matches("http://localhost:3000", &config));
    }

    #[test]
    fn origin_matches_list_exact() {
        let config = config_list();
        assert!(origin_matches("https://example.com", &config));
        assert!(origin_matches("https://app.example.com", &config));
        assert!(!origin_matches("https://evil.com", &config));
        assert!(!origin_matches("https://example.com.evil.com", &config));
    }

    #[test]
    fn origin_matches_wildcard_pattern() {
        let config = config_glob();
        assert!(origin_matches("https://foo.example.com", &config));
        assert!(origin_matches("https://bar.example.com", &config));
        assert!(!origin_matches("https://example.com", &config));
        assert!(!origin_matches("https://evil.com", &config));
    }

    #[test]
    fn validate_rejects_credentials_with_wildcard() {
        let config = CorsConfig {
            origins: vec!["*".into()],
            methods: vec![],
            headers: vec![],
            allow_credentials: true,
            max_age: 3600,
            expose_headers: vec![],
        };
        let err = validate_cors_config(&config).unwrap_err();
        assert!(err.contains("allow_credentials"));
        assert!(err.contains("origins"));
    }

    #[test]
    fn validate_accepts_credentials_with_list() {
        let config = config_list();
        assert!(validate_cors_config(&config).is_ok());
    }

    #[test]
    fn validate_accepts_wildcard_without_credentials() {
        let config = config_any();
        assert!(validate_cors_config(&config).is_ok());
    }
}
