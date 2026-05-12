use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The request sub-object inside [`PluginInput`].
/// Note: the request body is injected at the top level of the input by the JS
/// runtime and is accessible as `input.body` in JavaScript.
#[derive(Serialize, TS)]
pub struct PluginRequest {
    pub method: String,
    /// The matched OpenAPI path template, e.g. `/users/{id}`.
    pub route: String,
    pub path: String,
    /// Raw query string. Preserved for backward compatibility.
    pub query: String,
    /// Query parameters parsed according to the operation's OpenAPI parameter definitions.
    /// Scalar values are type-coerced; arrays and objects follow the OAS style/explode rules.
    /// Parameters not declared in the spec are included as raw strings.
    #[serde(rename = "queryParams")]
    #[ts(rename = "queryParams", type = "Record<string, unknown>")]
    pub query_params: serde_json::Value,
    pub headers: HashMap<String, String>,
    #[ts(type = "Record<string, unknown>")]
    pub params: HashMap<String, serde_json::Value>,
}

/// Input passed to a plugin's `handle()` function.
#[derive(Serialize, TS)]
pub struct PluginInput {
    pub request: PluginRequest,
    #[ts(type = "unknown")]
    pub config: serde_json::Value,
    #[ts(type = "unknown")]
    pub operation: serde_json::Value,
    #[ts(type = "Ctx")]
    pub ctx: serde_json::Value,
}

/// Output returned by a plugin's `handle()` function.
/// The response body is extracted separately by the JS runtime.
#[derive(Deserialize, Default, TS)]
pub struct PluginOutput {
    #[ts(optional)]
    pub status: Option<u16>,
    /// Headers to set on the response. A `null` value removes the header.
    #[ts(optional)]
    pub headers: Option<HashMap<String, Option<String>>>,
    #[ts(optional, type = "Record<string, unknown>")]
    pub ctx: Option<serde_json::Map<String, serde_json::Value>>,
}

/// The actual shape of the input object that JS plugin `handle()` receives.
/// Includes runtime-injected body fields not present on the base [`PluginInput`].
///
/// Used only for TypeScript type generation — never instantiated at runtime.
#[derive(Serialize, TS)]
#[ts(rename = "PluginInput")]
pub struct JsPluginInput {
    #[serde(flatten)]
    #[ts(flatten)]
    base: PluginInput,
    /// The parsed request body, injected by the JS runtime.
    #[ts(optional, type = "unknown")]
    body: Option<serde_json::Value>,
    /// Set to `"base64"` when `body` is a base64-encoded binary.
    #[serde(rename = "bodyEncoding")]
    #[ts(optional)]
    body_encoding: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_output_deserializes_all_fields() {
        let json = serde_json::json!({
            "status": 201,
            "headers": {"content-type": "application/json", "x-remove": null},
            "ctx": {"key": "value"}
        });
        let output: PluginOutput = serde_json::from_value(json).unwrap();
        assert_eq!(output.status, Some(201));
        let headers = output.headers.unwrap();
        assert_eq!(
            headers.get("content-type"),
            Some(&Some("application/json".to_string()))
        );
        assert_eq!(headers.get("x-remove"), Some(&None));
        assert_eq!(output.ctx.unwrap().get("key").unwrap(), "value");
    }

    #[test]
    fn plugin_output_deserializes_with_missing_fields() {
        let json = serde_json::json!({});
        let output: PluginOutput = serde_json::from_value(json).unwrap();
        assert_eq!(output.status, None);
        assert!(output.headers.is_none());
        assert!(output.ctx.is_none());
    }

    #[test]
    fn plugin_output_default_produces_all_none() {
        let output = PluginOutput::default();
        assert_eq!(output.status, None);
        assert!(output.headers.is_none());
        assert!(output.ctx.is_none());
    }

    #[test]
    fn plugin_output_unwrap_or_default_on_invalid_input() {
        let json = serde_json::json!("not an object");
        let output: PluginOutput = serde_json::from_value(json).unwrap_or_default();
        assert_eq!(output.status, None);
        assert!(output.headers.is_none());
    }
}
