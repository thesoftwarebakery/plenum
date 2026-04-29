use bytes::Bytes;

/// A gateway-level error: an HTTP status code paired with a JSON error body.
///
/// Use for unrecoverable errors in the gateway request lifecycle — situations where
/// the gateway itself cannot proceed and needs to synthesize a 5xx response.
/// Distinct from upstream errors and validation errors (which have their own formats).
///
/// Body format: `{"error": "<message>"}`
pub struct GatewayError {
    pub status: u16,
    body: Bytes,
}

impl GatewayError {
    fn new(status: u16, message: impl std::fmt::Display) -> Self {
        let body = Bytes::from(serde_json::json!({"error": message.to_string()}).to_string());
        Self { status, body }
    }

    /// 500 Internal Server Error — the gateway encountered an unexpected condition.
    pub fn internal(message: impl std::fmt::Display) -> Self {
        Self::new(500, message)
    }

    /// 502 Bad Gateway — the upstream returned an invalid or unrecognized response.
    pub fn bad_gateway(message: impl std::fmt::Display) -> Self {
        Self::new(502, message)
    }

    /// 503 Service Unavailable — the gateway cannot route the request right now.
    pub fn service_unavailable(message: impl std::fmt::Display) -> Self {
        Self::new(503, message)
    }

    /// 413 Payload Too Large — the inbound request body exceeded the configured limit.
    pub fn payload_too_large(message: impl std::fmt::Display) -> Self {
        Self::new(413, message)
    }

    /// 504 Gateway Timeout — the upstream did not respond in time.
    pub fn gateway_timeout(message: impl std::fmt::Display) -> Self {
        Self::new(504, message)
    }

    pub fn body(self) -> Bytes {
        self.body
    }
}

/// A structured gateway error ready to flow through the `on_gateway_error`
/// interceptor before being written to the downstream session.
///
/// Created at each error site, then passed to the central error response
/// codepath which optionally runs the interceptor and writes the response.
pub struct GatewayErrorResponse {
    /// HTTP status code for the error response.
    pub status: u16,
    /// JSON error body bytes.
    pub body: Bytes,
    /// Machine-readable error code (e.g. `"gateway_timeout"`, `"interceptor_error"`).
    pub error_code: &'static str,
    /// Human-readable error message.
    pub error_message: String,
    /// Extra response headers (e.g. `Allow` for 405). Empty by default.
    pub headers: Vec<(String, String)>,
}

impl GatewayErrorResponse {
    fn new(status: u16, error_code: &'static str, message: impl std::fmt::Display) -> Self {
        let msg = message.to_string();
        Self {
            status,
            body: Bytes::from(serde_json::json!({"error": &msg}).to_string()),
            error_code,
            error_message: msg,
            headers: vec![],
        }
    }

    /// 500 Internal Server Error — the gateway encountered an unexpected condition.
    pub fn internal(message: impl std::fmt::Display) -> Self {
        Self::new(500, "internal_error", message)
    }

    /// 502 Bad Gateway — the upstream returned an invalid or unrecognized response.
    pub fn bad_gateway(message: impl std::fmt::Display) -> Self {
        Self::new(502, "bad_gateway", message)
    }

    /// 504 Gateway Timeout — the upstream did not respond in time.
    pub fn gateway_timeout(message: impl std::fmt::Display) -> Self {
        Self::new(504, "gateway_timeout", message)
    }

    /// 413 Payload Too Large — the inbound request body exceeded the configured limit.
    pub fn payload_too_large(message: impl std::fmt::Display) -> Self {
        Self::new(413, "payload_too_large", message)
    }

    /// 404 Not Found — no matching route in the OpenAPI spec.
    pub fn not_found(message: impl std::fmt::Display) -> Self {
        Self::new(404, "not_found", message)
    }

    /// 429 Too Many Requests — the request has been rate limited.
    pub fn too_many_requests(message: impl std::fmt::Display) -> Self {
        Self::new(429, "too_many_requests", message)
    }

    /// 405 Method Not Allowed — the route exists but does not support this method.
    pub fn method_not_allowed(allowed_methods: &[&str]) -> Self {
        let allow_value = allowed_methods.join(", ");
        let mut resp = Self::new(405, "method_not_allowed", "method not allowed");
        resp.headers = vec![("Allow".to_string(), allow_value)];
        resp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_has_correct_status() {
        let e = GatewayError::internal("something went wrong");
        assert_eq!(e.status, 500);
    }

    #[test]
    fn body_produces_valid_json() {
        let e = GatewayError::internal("something went wrong");
        let v: serde_json::Value = serde_json::from_slice(&e.body()).unwrap();
        assert_eq!(v["error"], "something went wrong");
    }

    #[test]
    fn body_escapes_special_characters() {
        let e = GatewayError::internal(r#"error with "quotes" and \backslashes"#);
        let v: serde_json::Value = serde_json::from_slice(&e.body()).unwrap();
        assert!(v["error"].as_str().unwrap().contains("quotes"));
    }

    #[test]
    fn status_codes() {
        assert_eq!(GatewayError::bad_gateway("x").status, 502);
        assert_eq!(GatewayError::service_unavailable("x").status, 503);
        assert_eq!(GatewayError::gateway_timeout("x").status, 504);
        assert_eq!(GatewayError::payload_too_large("x").status, 413);
    }

    #[test]
    fn payload_too_large_has_correct_status() {
        let e = GatewayError::payload_too_large("request body too large");
        assert_eq!(e.status, 413);
        let v: serde_json::Value = serde_json::from_slice(&e.body()).unwrap();
        assert_eq!(v["error"], "request body too large");
    }
}
