use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use typeshare::typeshare;

/// Input passed to on_request and before_upstream interceptors.
#[typeshare]
#[derive(Debug, Serialize)]
pub struct RequestInput {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub query: String,
    pub params: HashMap<String, String>,
    pub operation: serde_json::Value,
    /// The request-scoped context bag. User-land keys plus `ctx.gateway.*` populated by the gateway.
    pub ctx: serde_json::Value,
}

/// Input passed to on_response interceptors.
#[typeshare]
#[derive(Debug, Serialize)]
pub struct ResponseInput {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub operation: serde_json::Value,
    /// The request-scoped context bag. User-land keys plus `ctx.gateway.*` populated by the gateway.
    pub ctx: serde_json::Value,
}

/// Output returned by any interceptor.
///
/// The JS interceptor returns `{ "action": "continue", ... }` to proceed
/// (optionally modifying headers/status), or `{ "action": "respond", ... }`
/// to short-circuit with an immediate response.
// Note: not annotated with #[typeshare] — typeshare requires tag+content for enums,
// but this uses internally-tagged serde (tag only). The TypeScript type is written
// manually in sdk/plenum.ts.
#[derive(Debug, Deserialize)]
#[serde(tag = "action")]
pub enum InterceptorOutput {
    /// Continue processing. Any fields present are applied as modifications.
    /// Headers are merged: new keys added, existing overwritten, `null` removes.
    #[serde(rename = "continue")]
    Continue {
        #[serde(default)]
        status: Option<u16>,
        #[serde(default)]
        headers: Option<HashMap<String, Option<String>>>,
        /// Ctx modifications to merge back into the request-scoped ctx bag.
        /// Shallow merge: returned keys overwrite; absent keys preserved.
        /// The `gateway` key is ignored — user-land cannot overwrite gateway-populated keys.
        #[serde(default)]
        ctx: Option<serde_json::Map<String, serde_json::Value>>,
    },

    /// Short-circuit: send this response immediately instead of proxying.
    #[serde(rename = "respond")]
    Respond {
        status: u16,
        #[serde(default)]
        headers: Option<HashMap<String, String>>,
        #[serde(default)]
        body: Option<String>,
    },
}

/// Build a `RequestInput` from an HTTP request's components.
pub fn request_input_from_parts(
    method: &http::Method,
    uri: &http::Uri,
    headers: &http::HeaderMap,
    params: HashMap<String, String>,
    operation: serde_json::Value,
    ctx: serde_json::Value,
) -> RequestInput {
    RequestInput {
        method: method.to_string(),
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
    headers: &http::HeaderMap,
    operation: serde_json::Value,
    ctx: serde_json::Value,
) -> ResponseInput {
    ResponseInput {
        status: status.as_u16(),
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
            serde_json::Value::Null,
        );
        assert_eq!(input.method, "GET");
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
            &headers,
            serde_json::Value::Null,
            serde_json::Value::Null,
        );
        assert_eq!(input.status, 404);
        assert_eq!(input.headers.get("content-type").unwrap(), "text/plain");
    }
}
