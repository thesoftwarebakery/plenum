use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Input passed to on_request and before_upstream interceptors.
#[derive(Debug, Serialize, TS)]
pub struct RequestInput {
    pub method: String,
    /// The matched OpenAPI path template, e.g. `/users/{id}`.
    pub route: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub query: String,
    pub params: HashMap<String, String>,
    #[ts(type = "unknown")]
    pub operation: serde_json::Value,
    /// Request-scoped context bag for passing data between interceptors and plugins.
    #[ts(type = "Ctx")]
    pub ctx: serde_json::Value,
}

/// Input passed to on_response and on_response_body interceptors.
#[derive(Debug, Serialize, TS)]
pub struct ResponseInput {
    pub status: u16,
    pub method: String,
    /// The matched OpenAPI path template, e.g. `/users/{id}`.
    pub route: String,
    pub headers: HashMap<String, String>,
    #[ts(type = "unknown")]
    pub operation: serde_json::Value,
    /// Request-scoped context bag for passing data between interceptors and plugins.
    #[ts(type = "Ctx")]
    pub ctx: serde_json::Value,
}

/// Output returned by any interceptor.
///
/// The JS interceptor returns `{ "action": "continue", ... }` to proceed
/// (optionally modifying headers/status), or `{ "action": "respond", ... }`
/// to short-circuit with an immediate response.
#[derive(Debug, Deserialize, TS)]
#[serde(tag = "action")]
pub enum InterceptorOutput {
    /// Continue processing. Any fields present are applied as modifications.
    /// Headers are merged: new keys added, existing overwritten, `null` removes.
    #[serde(rename = "continue")]
    Continue {
        #[serde(default)]
        #[ts(optional)]
        status: Option<u16>,
        #[serde(default)]
        #[ts(optional)]
        headers: Option<HashMap<String, Option<String>>>,
        /// Ctx modifications to merge back into the request-scoped ctx bag.
        /// Shallow merge: returned keys overwrite; absent keys preserved.
        /// The `gateway` key is ignored — user-land cannot overwrite gateway-populated keys.
        #[serde(default)]
        #[ts(optional, type = "Record<string, unknown>")]
        ctx: Option<serde_json::Map<String, serde_json::Value>>,
    },

    /// Short-circuit: send this response immediately instead of proxying.
    #[serde(rename = "respond")]
    Respond {
        status: u16,
        #[serde(default)]
        #[ts(optional)]
        headers: Option<HashMap<String, String>>,
        #[serde(default)]
        #[ts(optional)]
        body: Option<String>,
    },
}

/// What a JS interceptor function actually returns (before the runtime extracts
/// the `body` field).
///
/// This differs from [`InterceptorOutput`] because the JS runtime extracts `body`
/// from the return value before Rust deserialises the remainder. As a result,
/// `body` can be any JSON-serialisable value on either variant.
///
/// Used only for TypeScript type generation — never instantiated at runtime.
#[derive(Serialize, TS)]
#[serde(tag = "action")]
#[ts(rename = "InterceptorReturn")]
pub enum JsInterceptorOutput {
    #[serde(rename = "continue")]
    Continue {
        #[serde(default)]
        #[ts(optional)]
        status: Option<u16>,
        #[serde(default)]
        #[ts(optional)]
        headers: Option<HashMap<String, Option<String>>>,
        #[serde(default)]
        #[ts(optional, type = "Record<string, unknown>")]
        ctx: Option<serde_json::Map<String, serde_json::Value>>,
        #[serde(default)]
        #[ts(optional, type = "unknown")]
        body: Option<serde_json::Value>,
    },

    #[serde(rename = "respond")]
    Respond {
        status: u16,
        #[serde(default)]
        #[ts(optional)]
        headers: Option<HashMap<String, String>>,
        #[serde(default)]
        #[ts(optional, type = "unknown")]
        body: Option<serde_json::Value>,
    },
}

/// The actual shape of the input object that JS on_request / before_upstream
/// interceptors receive. Includes runtime-injected fields not present on the
/// base [`RequestInput`] struct.
///
/// Used only for TypeScript type generation — never instantiated at runtime.
#[derive(Serialize, TS)]
#[ts(rename = "RequestInput")]
pub struct JsRequestInput {
    #[serde(flatten)]
    #[ts(flatten)]
    base: RequestInput,
    /// Per-interceptor options from the overlay config, injected by `merge_options()`.
    #[ts(optional, type = "unknown")]
    options: Option<serde_json::Value>,
    /// Request body, injected by the JS runtime.
    #[ts(optional, type = "unknown")]
    body: Option<serde_json::Value>,
    /// Set to `"base64"` when `body` is a base64-encoded binary.
    #[serde(rename = "bodyEncoding")]
    #[ts(optional)]
    body_encoding: Option<String>,
}

/// The actual shape of the input object that JS on_response / on_response_body
/// interceptors receive. Includes runtime-injected fields not present on the
/// base [`ResponseInput`] struct.
///
/// Used only for TypeScript type generation — never instantiated at runtime.
#[derive(Serialize, TS)]
#[ts(rename = "ResponseInput")]
pub struct JsResponseInput {
    #[serde(flatten)]
    #[ts(flatten)]
    base: ResponseInput,
    /// Per-interceptor options from the overlay config, injected by `merge_options()`.
    #[ts(optional, type = "unknown")]
    options: Option<serde_json::Value>,
    /// Response body (on_response_body only), injected by the JS runtime.
    #[ts(optional, type = "unknown")]
    body: Option<serde_json::Value>,
    /// Set to `"base64"` when `body` is a base64-encoded binary.
    #[serde(rename = "bodyEncoding")]
    #[ts(optional)]
    body_encoding: Option<String>,
}

/// Machine-readable error context passed to `on_gateway_error` interceptors.
#[derive(Debug, Serialize, TS)]
pub struct ErrorContext {
    /// Machine-readable error code (e.g. `"gateway_timeout"`, `"interceptor_error"`).
    pub code: String,
    /// Human-readable error message.
    pub message: String,
}

/// Input passed to the global `on_gateway_error` interceptor.
#[derive(Debug, Serialize, TS)]
pub struct GatewayErrorInput {
    /// HTTP status code of the error response.
    pub status: u16,
    /// HTTP method of the original request.
    pub method: String,
    /// The matched OpenAPI path template (empty for pre-route errors like 404).
    pub route: String,
    /// The actual request path.
    pub path: String,
    /// Request headers from the original request.
    pub headers: HashMap<String, String>,
    /// Error context with machine-readable code and human-readable message.
    pub error: ErrorContext,
    /// Request-scoped context bag accumulated so far (may be empty for early errors).
    #[ts(type = "Ctx")]
    pub ctx: serde_json::Value,
}

/// Build a `GatewayErrorInput` from request metadata and error details.
#[allow(clippy::too_many_arguments)]
pub fn gateway_error_input_from_parts(
    method: &str,
    path: &str,
    route: &str,
    headers: &http::HeaderMap,
    error_code: &str,
    error_message: &str,
    status: u16,
    ctx: serde_json::Value,
) -> GatewayErrorInput {
    GatewayErrorInput {
        status,
        method: method.to_string(),
        route: route.to_string(),
        path: path.to_string(),
        headers: header_map_to_hash_map(headers),
        error: ErrorContext {
            code: error_code.to_string(),
            message: error_message.to_string(),
        },
        ctx,
    }
}

/// Build a `RequestInput` from an HTTP request's components.
pub fn request_input_from_parts(
    method: &http::Method,
    uri: &http::Uri,
    headers: &http::HeaderMap,
    params: HashMap<String, String>,
    operation: serde_json::Value,
    route: &str,
    ctx: serde_json::Value,
) -> RequestInput {
    RequestInput {
        method: method.to_string(),
        route: route.to_string(),
        path: uri.path().to_string(),
        headers: header_map_to_hash_map(headers),
        query: uri.query().unwrap_or("").to_string(),
        params,
        operation,
        ctx,
    }
}

/// Build a `ResponseInput` from an HTTP response's components.
pub fn response_input_from_parts(
    status: http::StatusCode,
    method: &str,
    route: &str,
    headers: &http::HeaderMap,
    operation: serde_json::Value,
    ctx: serde_json::Value,
) -> ResponseInput {
    ResponseInput {
        status: status.as_u16(),
        method: method.to_string(),
        route: route.to_string(),
        headers: header_map_to_hash_map(headers),
        operation,
        ctx,
    }
}

pub(crate) fn header_map_to_hash_map(headers: &http::HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                value.to_str().unwrap_or("").to_string(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- InterceptorOutput deserialization --

    #[test]
    fn deserializes_continue_no_modifications() {
        let output: InterceptorOutput =
            serde_json::from_value(json!({"action": "continue"})).unwrap();

        match output {
            InterceptorOutput::Continue {
                status,
                headers,
                ctx,
            } => {
                assert!(status.is_none());
                assert!(headers.is_none());
                assert!(ctx.is_none());
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn deserializes_continue_with_headers() {
        let output: InterceptorOutput = serde_json::from_value(json!({
            "action": "continue",
            "headers": {"x-foo": "bar", "x-baz": "qux"}
        }))
        .unwrap();

        match output {
            InterceptorOutput::Continue { headers, .. } => {
                let h = headers.unwrap();
                assert_eq!(h.get("x-foo").unwrap(), &Some("bar".to_string()));
                assert_eq!(h.get("x-baz").unwrap(), &Some("qux".to_string()));
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn deserializes_continue_with_header_removal() {
        let output: InterceptorOutput = serde_json::from_value(json!({
            "action": "continue",
            "headers": {"x-remove-me": null}
        }))
        .unwrap();

        match output {
            InterceptorOutput::Continue { headers, .. } => {
                let h = headers.unwrap();
                assert_eq!(h.get("x-remove-me").unwrap(), &None);
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn deserializes_continue_with_status() {
        let output: InterceptorOutput = serde_json::from_value(json!({
            "action": "continue",
            "status": 201
        }))
        .unwrap();

        match output {
            InterceptorOutput::Continue { status, .. } => {
                assert_eq!(status, Some(201));
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn deserializes_respond_short_circuit() {
        let output: InterceptorOutput = serde_json::from_value(json!({
            "action": "respond",
            "status": 403,
            "headers": {"content-type": "application/json"},
            "body": "{\"error\": \"forbidden\"}"
        }))
        .unwrap();

        match output {
            InterceptorOutput::Respond {
                status,
                headers,
                body,
            } => {
                assert_eq!(status, 403);
                assert_eq!(
                    headers.unwrap().get("content-type").unwrap(),
                    "application/json"
                );
                assert_eq!(body.unwrap(), "{\"error\": \"forbidden\"}");
            }
            _ => panic!("expected Respond"),
        }
    }

    #[test]
    fn deserializes_respond_minimal() {
        let output: InterceptorOutput =
            serde_json::from_value(json!({"action": "respond", "status": 204})).unwrap();

        match output {
            InterceptorOutput::Respond {
                status,
                headers,
                body,
            } => {
                assert_eq!(status, 204);
                assert!(headers.is_none());
                assert!(body.is_none());
            }
            _ => panic!("expected Respond"),
        }
    }

    #[test]
    fn deserializes_continue_with_ctx() {
        let output: InterceptorOutput = serde_json::from_value(json!({
            "action": "continue",
            "ctx": {"userTier": "pro", "tokenCost": 420}
        }))
        .unwrap();

        match output {
            InterceptorOutput::Continue { ctx, .. } => {
                let c = ctx.unwrap();
                assert_eq!(c["userTier"], "pro");
                assert_eq!(c["tokenCost"], 420);
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn deserializes_continue_without_ctx_is_none() {
        let output: InterceptorOutput =
            serde_json::from_value(json!({"action": "continue"})).unwrap();

        match output {
            InterceptorOutput::Continue { ctx, .. } => {
                assert!(ctx.is_none());
            }
            _ => panic!("expected Continue"),
        }
    }

    #[test]
    fn rejects_invalid_action() {
        let result = serde_json::from_value::<InterceptorOutput>(json!({"action": "invalid"}));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_missing_action() {
        let result = serde_json::from_value::<InterceptorOutput>(json!({"status": 200}));
        assert!(result.is_err());
    }

    // -- RequestInput serialization --

    #[test]
    fn request_input_serializes_correctly() {
        let input = RequestInput {
            method: "POST".into(),
            route: "/items/{id}".into(),
            path: "/items/123".into(),
            headers: HashMap::from([
                ("content-type".into(), "application/json".into()),
                ("authorization".into(), "Bearer tok".into()),
            ]),
            query: "page=1".into(),
            params: HashMap::from([("id".into(), "123".into())]),
            operation: serde_json::Value::Null,
            ctx: serde_json::Value::Null,
        };
        let json = serde_json::to_value(&input).unwrap();
        assert_eq!(json["method"], "POST");
        assert_eq!(json["path"], "/items/123");
        assert_eq!(json["query"], "page=1");
        assert_eq!(json["headers"]["content-type"], "application/json");
        assert_eq!(json["params"]["id"], "123");
    }

    // -- ResponseInput serialization --

    #[test]
    fn response_input_serializes_correctly() {
        let input = ResponseInput {
            status: 200,
            method: "GET".into(),
            route: "/items".into(),
            headers: HashMap::from([("x-request-id".into(), "abc".into())]),
            operation: serde_json::Value::Null,
            ctx: serde_json::Value::Null,
        };
        let json = serde_json::to_value(&input).unwrap();
        assert_eq!(json["status"], 200);
        assert_eq!(json["headers"]["x-request-id"], "abc");
    }

    // -- Conversion helpers --

    #[test]
    fn request_input_from_http_parts() {
        let uri: http::Uri = "https://example.com/items?page=2&limit=10".parse().unwrap();
        let method = http::Method::GET;
        let mut headers = http::HeaderMap::new();
        headers.insert("x-custom", "value".parse().unwrap());

        let input = request_input_from_parts(
            &method,
            &uri,
            &headers,
            HashMap::new(),
            serde_json::Value::Null,
            "/items",
            serde_json::Value::Null,
        );
        assert_eq!(input.method, "GET");
        assert_eq!(input.route, "/items");
        assert_eq!(input.path, "/items");
        assert_eq!(input.query, "page=2&limit=10");
        assert_eq!(input.headers.get("x-custom").unwrap(), "value");
        assert!(input.params.is_empty());
    }

    #[test]
    fn request_input_includes_path_params() {
        let uri: http::Uri = "https://example.com/items/42".parse().unwrap();
        let method = http::Method::GET;
        let headers = http::HeaderMap::new();
        let params = HashMap::from([("id".to_string(), "42".to_string())]);

        let input = request_input_from_parts(
            &method,
            &uri,
            &headers,
            params,
            serde_json::Value::Null,
            "/items/{id}",
            serde_json::Value::Null,
        );
        assert_eq!(input.params.get("id").unwrap(), "42");
    }

    #[test]
    fn response_input_from_http_parts() {
        let status = http::StatusCode::NOT_FOUND;
        let mut headers = http::HeaderMap::new();
        headers.insert("content-type", "text/plain".parse().unwrap());

        let input = response_input_from_parts(
            status,
            "GET",
            "/items/{id}",
            &headers,
            serde_json::Value::Null,
            serde_json::Value::Null,
        );
        assert_eq!(input.status, 404);
        assert_eq!(input.method, "GET");
        assert_eq!(input.route, "/items/{id}");
        assert_eq!(input.headers.get("content-type").unwrap(), "text/plain");
    }
}
