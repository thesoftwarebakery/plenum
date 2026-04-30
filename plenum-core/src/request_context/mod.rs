//! Request context token extraction.
//!
//! Parses `${{namespace.key}}` tokens from configuration strings and resolves
//! them at runtime against request data. This is the **canonical** way for any
//! Plenum feature (rate limiting, consistent hashing, routing conditions, …) to
//! reference values from the incoming request. Features must not implement their
//! own extraction logic.
//!
//! ## Supported tokens
//!
//! | Token | Description |
//! |---|---|
//! | `${{header.name}}` | Request header value (name is case-insensitive) |
//! | `${{query.key}}` | Query string parameter |
//! | `${{path-param.name}}` | Path parameter captured from the OpenAPI route template |
//! | `${{cookie.name}}` | Cookie value |
//! | `${{ctx.dotpath}}` | Value from the request ctx bag set by interceptors (dot-path: `ctx.auth.userId`) |
//! | `${{client-ip}}` | Client IP — prefers `X-Forwarded-For`, falls back to direct peer address |
//! | `${{path}}` | Full request path |
//! | `${{method}}` | HTTP method |
//!
//! ## Single expression vs. template
//!
//! [`ContextRef`] represents one `${{…}}` token. Use it when a config field
//! holds exactly one expression.
//!
//! [`ContextTemplate`] represents a string that may contain one or more
//! `${{…}}` tokens with optional literal text between them, e.g.
//! `"${{header.x-tenant}}-${{ctx.userId}}"`. Use it when a config field is a
//! free-form template string.

pub mod config_value;

use std::collections::HashMap;

use crate::config::interpolation::{Template, TemplatePart, Token};

// ── ExtractionCtx ────────────────────────────────────────────────────────────

/// All per-request data that may be needed to resolve a [`ContextRef`].
///
/// Build one at the call site and pass it to [`ContextRef::extract`] /
/// [`ContextTemplate::resolve`].
pub struct ExtractionCtx<'a> {
    pub req: &'a pingora_http::RequestHeader,
    pub path_params: &'a HashMap<String, serde_json::Value>,
    /// The request-scoped user ctx bag written by interceptors.
    /// Required for `${{ctx.*}}` expressions; absent or `None` → `None`.
    pub user_ctx: Option<&'a serde_json::Map<String, serde_json::Value>>,
    /// Direct peer IP, used as fallback for `${{client-ip}}` when
    /// `X-Forwarded-For` is absent.
    pub peer_addr: Option<std::net::IpAddr>,
    /// Pre-parsed typed query parameters. When present, `query.*` tokens resolve
    /// to typed JSON values rather than raw strings. Optional — absent in contexts
    /// that don't have queryParams available (response hooks, hash-key selection, etc).
    pub query_params: Option<&'a serde_json::Map<String, serde_json::Value>>,
    /// Parsed request/response body. Present only when the body has been buffered
    /// and is JSON-parseable. `body.*` tokens resolve to `null` when absent.
    pub body_json: Option<&'a serde_json::Value>,
}

// ── ContextRef ───────────────────────────────────────────────────────────────

/// A parsed reference to a single `${{namespace.key}}` token.
///
/// Created at config-parse time via [`ContextRef::parse`] and evaluated at
/// request time via [`ContextRef::extract`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextRef {
    source: Source,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Source {
    Header(String),
    Query(String),
    PathParam(String),
    Cookie(String),
    /// Dot-path walk through the user ctx bag, e.g. `"auth.userId"`.
    UserCtx(String),
    ClientIp,
    Path,
    Method,
    /// Top-level field from the parsed JSON request body.
    Body(String),
}

impl ContextRef {
    /// Parse a `${{namespace.key}}` token string using the shared
    /// [`Template`] parser, then validate that it references a known
    /// runtime namespace.
    ///
    /// Returns an error if the token is malformed or references an unknown namespace.
    pub fn parse(token: &str) -> Result<Self, String> {
        let template = Template::parse(token)?;
        let parts = template.parts();

        // Must be exactly one expression, no literals.
        if parts.len() != 1 {
            return Err(format!(
                "invalid context token '{token}': must be a single ${{{{...}}}} expression"
            ));
        }

        let parsed_token = match &parts[0] {
            TemplatePart::Expr(t) => t,
            TemplatePart::Literal(_) => {
                return Err(format!(
                    "invalid context token '{token}': must be wrapped in ${{{{...}}}}"
                ));
            }
        };

        Self::from_token(parsed_token)
    }

    /// Convert a parsed [`Token`] into a [`ContextRef`] by validating
    /// the namespace and key. This is used by both [`ContextRef::parse`]
    /// and [`ContextTemplate::parse`].
    pub(super) fn from_token(token: &Token) -> Result<Self, String> {
        let key = if token.key.is_empty() {
            None
        } else {
            Some(token.key.as_str())
        };

        match token.namespace.as_str() {
            "header" => {
                let k = key.ok_or("${{header.name}} requires a header name")?;
                if k.is_empty() {
                    return Err("${{header.name}} requires a non-empty header name".to_string());
                }
                Ok(Self {
                    source: Source::Header(k.to_lowercase()),
                })
            }
            "query" => {
                let k = key.ok_or("${{query.key}} requires a parameter name")?;
                if k.is_empty() {
                    return Err("${{query.key}} requires a non-empty parameter name".to_string());
                }
                Ok(Self {
                    source: Source::Query(k.to_string()),
                })
            }
            "path-param" => {
                let k = key.ok_or("${{path-param.name}} requires a parameter name")?;
                if k.is_empty() {
                    return Err(
                        "${{path-param.name}} requires a non-empty parameter name".to_string()
                    );
                }
                Ok(Self {
                    source: Source::PathParam(k.to_string()),
                })
            }
            "cookie" => {
                let k = key.ok_or("${{cookie.name}} requires a cookie name")?;
                if k.is_empty() {
                    return Err("${{cookie.name}} requires a non-empty cookie name".to_string());
                }
                Ok(Self {
                    source: Source::Cookie(k.to_string()),
                })
            }
            "ctx" => {
                let k = key.ok_or("${{ctx.dotpath}} requires a path (e.g. ctx.userId)")?;
                if k.is_empty() {
                    return Err("${{ctx.dotpath}} requires a non-empty dot-path".to_string());
                }
                Ok(Self {
                    source: Source::UserCtx(k.to_string()),
                })
            }
            "client-ip" => {
                if key.is_some() {
                    return Err("${{client-ip}} does not take a sub-key".to_string());
                }
                Ok(Self {
                    source: Source::ClientIp,
                })
            }
            "path" => match key {
                Some(k) if !k.is_empty() => Ok(Self {
                    source: Source::PathParam(k.to_string()),
                }),
                Some(_) => Err("${{path.name}} requires a non-empty parameter name".to_string()),
                None => Ok(Self {
                    source: Source::Path,
                }),
            },
            "method" => {
                if key.is_some() {
                    return Err("${{method}} does not take a sub-key".to_string());
                }
                Ok(Self {
                    source: Source::Method,
                })
            }
            "body" => {
                let k = key.ok_or("${{body.field}} requires a field name")?;
                if k.is_empty() {
                    return Err("${{body.field}} requires a non-empty field name".to_string());
                }
                Ok(Self {
                    source: Source::Body(k.to_string()),
                })
            }
            other => Err(format!(
                "unknown context namespace '{other}'; expected one of: \
                 header, query, path-param, path, cookie, ctx, client-ip, method, body"
            )),
        }
    }

    /// Extract the referenced value from the request context.
    ///
    /// Returns `None` if the referenced value is absent (e.g. missing header,
    /// unresolvable ctx path).
    pub fn extract(&self, cx: &ExtractionCtx<'_>) -> Option<String> {
        match &self.source {
            Source::Header(name) => cx
                .req
                .headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            Source::Query(key) => {
                let query_str = cx.req.uri.query()?;
                form_urlencoded::parse(query_str.as_bytes())
                    .find(|(k, _)| k == key)
                    .map(|(_, v)| v.into_owned())
            }
            Source::PathParam(name) => cx.path_params.get(name.as_str()).map(|v| match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            }),
            Source::Cookie(name) => {
                let cookie_header = cx.req.headers.get("cookie")?;
                let cookie_str = cookie_header.to_str().ok()?;
                cookie_str
                    .split(';')
                    .filter_map(|pair| {
                        let pair = pair.trim();
                        let (k, v) = pair.split_once('=')?;
                        if k.trim() == name.as_str() {
                            Some(v.trim().to_string())
                        } else {
                            None
                        }
                    })
                    .next()
            }
            Source::UserCtx(path) => {
                let map = cx.user_ctx?;
                ctx_dot_path(map, path).map(json_value_to_string)
            }
            Source::ClientIp => {
                // Prefer X-Forwarded-For (leftmost entry = original client).
                if let Some(Ok(xff)) = cx.req.headers.get("x-forwarded-for").map(|v| v.to_str()) {
                    return Some(xff.split(',').next().unwrap_or(xff).trim().to_string());
                }
                // Fall back to direct peer address.
                cx.peer_addr.map(|ip| ip.to_string())
            }
            Source::Path => Some(cx.req.uri.path().to_string()),
            Source::Method => Some(cx.req.method.as_str().to_string()),
            Source::Body(field) => cx
                .body_json
                .and_then(|b| b.get(field.as_str()))
                .map(json_value_to_string),
        }
    }

    /// Like [`extract`] but returns a typed [`serde_json::Value`] instead of always
    /// a `String`. For `query.*` tokens this uses `cx.query_params` when present,
    /// preserving integer/boolean types. For `body.*` tokens this reads from
    /// `cx.body_json`. All other sources wrap the string result in `Value::String`.
    /// Returns `None` if the source value is absent (missing header, body not
    /// buffered, etc.).
    pub fn extract_value(&self, cx: &ExtractionCtx<'_>) -> Option<serde_json::Value> {
        match &self.source {
            Source::Query(key) => {
                if let Some(qp) = cx.query_params {
                    return qp.get(key.as_str()).cloned();
                }
                self.extract(cx).map(serde_json::Value::String)
            }
            Source::PathParam(name) => cx.path_params.get(name.as_str()).cloned(),
            Source::Body(field) => cx.body_json.and_then(|b| b.get(field.as_str())).cloned(),
            _ => self.extract(cx).map(serde_json::Value::String),
        }
    }
}

// ── ContextTemplate ──────────────────────────────────────────────────────────

/// A parsed template string containing one or more `${{…}}` expressions with
/// optional literal text between them.
///
/// Constructed at config-parse time; resolved per-request via
/// [`ContextTemplate::resolve`].
///
/// # Examples
///
/// ```text
/// "${{header.x-api-key}}"
/// "${{header.x-tenant}}-${{ctx.userId}}"
/// "tenant:${{ctx.tenantId}}:user:${{ctx.userId}}"
/// ```
#[derive(Debug, Clone)]
pub struct ContextTemplate {
    /// Shared parsed template — handles the `${{ }}` syntax.
    template: Template,
    /// Pre-validated runtime context refs for each expression part.
    refs: Vec<Option<ContextRef>>,
}

impl ContextTemplate {
    /// Parse a template string into a [`ContextTemplate`].
    ///
    /// Uses the shared [`Template`] parser for `${{ }}` syntax, then
    /// validates that all expression tokens reference known runtime
    /// namespaces.
    ///
    /// Returns an error if the string contains no `${{…}}` expressions, any
    /// expression is malformed, or any namespace is unknown.
    pub fn parse(template_str: &str) -> Result<Self, String> {
        let template = Template::parse(template_str)?;

        if !template.has_expressions() {
            return Err(format!(
                "template '{template_str}' contains no ${{{{...}}}} expressions"
            ));
        }

        // Validate all expressions reference known runtime namespaces.
        let mut refs = Vec::new();
        for part in template.parts() {
            match part {
                TemplatePart::Literal(_) => refs.push(None),
                TemplatePart::Expr(token) => {
                    refs.push(Some(ContextRef::from_token(token)?));
                }
            }
        }

        Ok(Self { template, refs })
    }

    /// Resolve all expressions in the template against the request context.
    ///
    /// Returns `None` if any expression fails to resolve (e.g. a required
    /// header is absent). In that case the whole template is considered
    /// unresolvable and the caller should skip rate limiting / hashing.
    pub fn resolve(&self, cx: &ExtractionCtx<'_>) -> Option<String> {
        let mut result = String::new();
        for (part, ctx_ref) in self.template.parts().iter().zip(self.refs.iter()) {
            match part {
                TemplatePart::Literal(s) => result.push_str(s),
                TemplatePart::Expr(_) => {
                    result.push_str(&ctx_ref.as_ref()?.extract(cx)?);
                }
            }
        }
        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    }

    /// Returns the original template string as written in configuration.
    pub fn as_str(&self) -> &str {
        self.template.as_str()
    }
}

impl std::fmt::Display for ContextTemplate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.template.as_str())
    }
}

impl<'de> serde::Deserialize<'de> for ContextTemplate {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        ContextTemplate::parse(&s).map_err(serde::de::Error::custom)
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/// Walk a dot-separated path through a JSON object map.
///
/// `"auth.userId"` → `map["auth"]["userId"]`
fn ctx_dot_path<'a>(
    map: &'a serde_json::Map<String, serde_json::Value>,
    path: &str,
) -> Option<&'a serde_json::Value> {
    let mut segments = path.split('.');
    let first = segments.next()?;
    let mut current: Option<&serde_json::Value> = map.get(first);
    for segment in segments {
        current = current?.as_object()?.get(segment);
    }
    current
}

fn json_value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_request(
        method: &str,
        uri: &str,
        headers: Vec<(&str, &str)>,
    ) -> pingora_http::RequestHeader {
        let mut req = pingora_http::RequestHeader::build(method, uri.as_bytes(), None).unwrap();
        for (name, value) in headers {
            req.insert_header(name.to_string(), value).unwrap();
        }
        req
    }

    fn cx<'a>(
        req: &'a pingora_http::RequestHeader,
        path_params: &'a HashMap<String, serde_json::Value>,
    ) -> ExtractionCtx<'a> {
        ExtractionCtx {
            req,
            path_params,
            user_ctx: None,
            peer_addr: None,
            query_params: None,
            body_json: None,
        }
    }

    fn cx_with_ctx<'a>(
        req: &'a pingora_http::RequestHeader,
        path_params: &'a HashMap<String, serde_json::Value>,
        user_ctx: &'a serde_json::Map<String, serde_json::Value>,
    ) -> ExtractionCtx<'a> {
        ExtractionCtx {
            req,
            path_params,
            user_ctx: Some(user_ctx),
            peer_addr: None,
            query_params: None,
            body_json: None,
        }
    }

    // ── ContextRef::parse ─────────────────────────────────────────────────────

    #[test]
    fn parses_header_token() {
        let r = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(r.source, Source::Header("x-api-key".to_string()));
    }

    #[test]
    fn header_name_lowercased() {
        let r = ContextRef::parse("${{header.X-Api-Key}}").unwrap();
        assert_eq!(r.source, Source::Header("x-api-key".to_string()));
    }

    #[test]
    fn parses_query_token() {
        let r = ContextRef::parse("${{query.api_key}}").unwrap();
        assert_eq!(r.source, Source::Query("api_key".to_string()));
    }

    #[test]
    fn parses_path_param_token() {
        let r = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(r.source, Source::PathParam("id".to_string()));
    }

    #[test]
    fn parses_cookie_token() {
        let r = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(r.source, Source::Cookie("session".to_string()));
    }

    #[test]
    fn parses_ctx_token() {
        let r = ContextRef::parse("${{ctx.auth.userId}}").unwrap();
        assert_eq!(r.source, Source::UserCtx("auth.userId".to_string()));
    }

    #[test]
    fn parses_client_ip_token() {
        let r = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(r.source, Source::ClientIp);
    }

    #[test]
    fn parses_path_token() {
        let r = ContextRef::parse("${{path}}").unwrap();
        assert_eq!(r.source, Source::Path);
    }

    #[test]
    fn parses_method_token() {
        let r = ContextRef::parse("${{method}}").unwrap();
        assert_eq!(r.source, Source::Method);
    }

    #[test]
    fn rejects_missing_wrapper() {
        assert!(ContextRef::parse("header.x-api-key").is_err());
    }

    #[test]
    fn rejects_empty_token() {
        assert!(ContextRef::parse("${{}}").is_err());
    }

    #[test]
    fn rejects_unknown_namespace() {
        let err = ContextRef::parse("${{unknown.name}}").unwrap_err();
        assert!(err.contains("unknown context namespace"), "got: {err}");
    }

    #[test]
    fn parses_body_token() {
        let r = ContextRef::parse("${{body.name}}").unwrap();
        assert_eq!(r.source, Source::Body("name".to_string()));
    }

    #[test]
    fn parses_path_dot_param_as_path_param() {
        let r = ContextRef::parse("${{path.id}}").unwrap();
        assert_eq!(r.source, Source::PathParam("id".to_string()));
    }

    #[test]
    fn rejects_header_without_name() {
        assert!(ContextRef::parse("${{header}}").is_err());
    }

    #[test]
    fn rejects_header_with_empty_name() {
        assert!(ContextRef::parse("${{header.}}").is_err());
    }

    #[test]
    fn rejects_ctx_without_path() {
        assert!(ContextRef::parse("${{ctx}}").is_err());
    }

    #[test]
    fn rejects_client_ip_with_sub_key() {
        let err = ContextRef::parse("${{client-ip.something}}").unwrap_err();
        assert!(err.contains("does not take a sub-key"), "got: {err}");
    }

    #[test]
    fn path_with_sub_key_maps_to_path_param() {
        let r = ContextRef::parse("${{path.extra}}").unwrap();
        assert_eq!(r.source, Source::PathParam("extra".to_string()));
    }

    #[test]
    fn rejects_method_with_sub_key() {
        assert!(ContextRef::parse("${{method.extra}}").is_err());
    }

    // ── ContextRef::extract ───────────────────────────────────────────────────

    #[test]
    fn extracts_header_value() {
        let req = make_request("GET", "/test", vec![("x-api-key", "secret123")]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("secret123".to_string()));
    }

    #[test]
    fn extracts_missing_header_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_query_parameter() {
        let req = make_request("GET", "/test?api_key=abc&other=1", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{query.api_key}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("abc".to_string()));
    }

    #[test]
    fn extracts_missing_query_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{query.missing}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_path_param() {
        let req = make_request("GET", "/users/42", vec![]);
        let mut params = HashMap::new();
        params.insert(
            "id".to_string(),
            serde_json::Value::String("42".to_string()),
        );
        let r = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("42".to_string()));
    }

    #[test]
    fn extracts_missing_path_param_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_cookie_value() {
        let req = make_request(
            "GET",
            "/test",
            vec![("cookie", "session=abc123; theme=dark")],
        );
        let params = HashMap::new();
        let r = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("abc123".to_string()));
    }

    #[test]
    fn extracts_missing_cookie_as_none() {
        let req = make_request("GET", "/test", vec![("cookie", "theme=dark")]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_ctx_top_level() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let user_ctx = json!({ "userId": "abc123" });
        let map = user_ctx.as_object().unwrap();
        let r = ContextRef::parse("${{ctx.userId}}").unwrap();
        assert_eq!(
            r.extract(&cx_with_ctx(&req, &params, map)),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn extracts_ctx_nested() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let user_ctx = json!({ "auth": { "userId": "abc123" } });
        let map = user_ctx.as_object().unwrap();
        let r = ContextRef::parse("${{ctx.auth.userId}}").unwrap();
        assert_eq!(
            r.extract(&cx_with_ctx(&req, &params, map)),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn extracts_ctx_missing_returns_none() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let user_ctx = json!({});
        let map = user_ctx.as_object().unwrap();
        let r = ContextRef::parse("${{ctx.userId}}").unwrap();
        assert_eq!(r.extract(&cx_with_ctx(&req, &params, map)), None);
    }

    #[test]
    fn extracts_ctx_absent_when_no_user_ctx() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{ctx.userId}}").unwrap();
        // ExtractionCtx with user_ctx: None
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_client_ip_from_xff() {
        let req = make_request(
            "GET",
            "/test",
            vec![("x-forwarded-for", "1.2.3.4, 5.6.7.8")],
        );
        let params = HashMap::new();
        let r = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("1.2.3.4".to_string()));
    }

    #[test]
    fn extracts_client_ip_from_peer_when_no_xff() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let peer: std::net::IpAddr = "10.0.0.1".parse().unwrap();
        let ecx = ExtractionCtx {
            req: &req,
            path_params: &params,
            user_ctx: None,
            peer_addr: Some(peer),
            query_params: None,
            body_json: None,
        };
        let r = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(r.extract(&ecx), Some("10.0.0.1".to_string()));
    }

    #[test]
    fn client_ip_none_without_xff_or_peer() {
        let req = make_request("GET", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extracts_path() {
        let req = make_request("GET", "/users/42?q=1", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{path}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("/users/42".to_string()));
    }

    #[test]
    fn extracts_method() {
        let req = make_request("POST", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{method}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), Some("POST".to_string()));
    }

    #[test]
    fn extracts_body_field() {
        let req = make_request("POST", "/test", vec![]);
        let params = HashMap::new();
        let body = json!({ "name": "alice", "age": 30 });
        let r = ContextRef::parse("${{body.name}}").unwrap();
        let ecx = ExtractionCtx {
            req: &req,
            path_params: &params,
            user_ctx: None,
            peer_addr: None,
            query_params: None,
            body_json: Some(&body),
        };
        assert_eq!(r.extract(&ecx), Some("alice".to_string()));
    }

    #[test]
    fn extracts_body_field_absent_when_no_body() {
        let req = make_request("POST", "/test", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{body.name}}").unwrap();
        assert_eq!(r.extract(&cx(&req, &params)), None);
    }

    #[test]
    fn extract_value_uses_typed_query_params() {
        let req = make_request("GET", "/test?limit=10", vec![]);
        let params = HashMap::new();
        let mut qp = serde_json::Map::new();
        qp.insert("limit".to_string(), json!(10u64));
        let r = ContextRef::parse("${{query.limit}}").unwrap();
        let ecx = ExtractionCtx {
            req: &req,
            path_params: &params,
            user_ctx: None,
            peer_addr: None,
            query_params: Some(&qp),
            body_json: None,
        };
        // Should return typed Number, not String
        assert_eq!(r.extract_value(&ecx), Some(json!(10u64)));
    }

    #[test]
    fn extract_value_falls_back_to_raw_query_when_no_typed_params() {
        let req = make_request("GET", "/test?key=abc", vec![]);
        let params = HashMap::new();
        let r = ContextRef::parse("${{query.key}}").unwrap();
        assert_eq!(
            r.extract_value(&cx(&req, &params)),
            Some(serde_json::Value::String("abc".to_string()))
        );
    }

    #[test]
    fn extract_value_returns_typed_body_field() {
        let req = make_request("POST", "/test", vec![]);
        let params = HashMap::new();
        let body = json!({ "count": 42 });
        let r = ContextRef::parse("${{body.count}}").unwrap();
        let ecx = ExtractionCtx {
            req: &req,
            path_params: &params,
            user_ctx: None,
            peer_addr: None,
            query_params: None,
            body_json: Some(&body),
        };
        assert_eq!(r.extract_value(&ecx), Some(json!(42)));
    }

    #[test]
    fn extract_value_returns_typed_path_param() {
        // Typed integer path param — coercion done upstream, stored as Value::Number.
        let req = make_request("GET", "/users/42", vec![]);
        let mut params = HashMap::new();
        params.insert("id".to_string(), serde_json::Value::Number(42.into()));
        let r = ContextRef::parse("${{path.id}}").unwrap();
        assert_eq!(r.extract_value(&cx(&req, &params)), Some(json!(42)));
    }

    #[test]
    fn extract_value_path_param_string_for_unknown_type() {
        // Untyped path param falls back to string storage — extract_value preserves it.
        let req = make_request("GET", "/items/abc", vec![]);
        let mut params = HashMap::new();
        params.insert("slug".to_string(), serde_json::Value::String("abc".into()));
        let r = ContextRef::parse("${{path.slug}}").unwrap();
        assert_eq!(r.extract_value(&cx(&req, &params)), Some(json!("abc")));
    }

    // ── ContextTemplate::parse ────────────────────────────────────────────────

    #[test]
    fn template_parses_single_expr() {
        let t = ContextTemplate::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(t.template.parts().len(), 1);
        assert!(matches!(&t.template.parts()[0], TemplatePart::Expr(_)));
    }

    #[test]
    fn template_parses_composite() {
        let t = ContextTemplate::parse("${{header.x-tenant}}-${{ctx.userId}}").unwrap();
        assert_eq!(t.template.parts().len(), 3); // Expr, Literal("-"), Expr
        assert!(matches!(&t.template.parts()[0], TemplatePart::Expr(_)));
        assert!(matches!(&t.template.parts()[1], TemplatePart::Literal(s) if s == "-"));
        assert!(matches!(&t.template.parts()[2], TemplatePart::Expr(_)));
    }

    #[test]
    fn template_parses_with_surrounding_literals() {
        let t = ContextTemplate::parse("tenant:${{ctx.tenantId}}:v1").unwrap();
        assert_eq!(t.template.parts().len(), 3);
        assert!(matches!(&t.template.parts()[0], TemplatePart::Literal(s) if s == "tenant:"));
        assert!(matches!(&t.template.parts()[1], TemplatePart::Expr(_)));
        assert!(matches!(&t.template.parts()[2], TemplatePart::Literal(s) if s == ":v1"));
    }

    #[test]
    fn template_rejects_no_expressions() {
        assert!(ContextTemplate::parse("plain-string").is_err());
        assert!(ContextTemplate::parse("").is_err());
    }

    #[test]
    fn template_rejects_unknown_namespace() {
        assert!(ContextTemplate::parse("${{unknown.x}}").is_err());
    }

    #[test]
    fn template_accepts_body_namespace() {
        let t = ContextTemplate::parse("${{body.name}}").unwrap();
        assert_eq!(t.template.parts().len(), 1);
    }

    #[test]
    fn template_rejects_unclosed_expr() {
        assert!(ContextTemplate::parse("${{header.x").is_err());
    }

    #[test]
    fn template_as_str_returns_original() {
        let s = "${{header.x-tenant}}-${{ctx.userId}}";
        let t = ContextTemplate::parse(s).unwrap();
        assert_eq!(t.as_str(), s);
    }

    // ── ContextTemplate::resolve ──────────────────────────────────────────────

    #[test]
    fn template_resolves_single_header() {
        let req = make_request("GET", "/test", vec![("x-api-key", "key-123")]);
        let params = HashMap::new();
        let t = ContextTemplate::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(t.resolve(&cx(&req, &params)), Some("key-123".to_string()));
    }

    #[test]
    fn template_resolves_composite() {
        let req = make_request("GET", "/test", vec![("x-tenant", "acme")]);
        let params = HashMap::new();
        let user_ctx = json!({ "userId": "u-99" });
        let map = user_ctx.as_object().unwrap();
        let t = ContextTemplate::parse("${{header.x-tenant}}-${{ctx.userId}}").unwrap();
        assert_eq!(
            t.resolve(&cx_with_ctx(&req, &params, map)),
            Some("acme-u-99".to_string())
        );
    }

    #[test]
    fn template_returns_none_if_any_expr_missing() {
        let req = make_request("GET", "/test", vec![]); // no x-api-key
        let params = HashMap::new();
        let t = ContextTemplate::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(t.resolve(&cx(&req, &params)), None);
    }

    #[test]
    fn template_deserializes_from_string() {
        let json = r#""${{header.x-api-key}}""#;
        let t: ContextTemplate = serde_json::from_str(json).unwrap();
        assert_eq!(t.as_str(), "${{header.x-api-key}}");
    }

    #[test]
    fn template_deserialization_fails_for_invalid_expr() {
        let json = r#""${{unknown.x}}""#;
        assert!(serde_json::from_str::<ContextTemplate>(json).is_err());
    }
}
