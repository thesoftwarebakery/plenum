//! Request context token extraction.
//!
//! Parses `${{namespace.key}}` tokens from configuration strings and resolves
//! them at runtime against request headers, query parameters, path parameters,
//! cookies, and other request properties.
//!
//! This module is the canonical way to reference request context in Plenum
//! configuration. Any feature that needs to extract a value from the incoming
//! request (consistent hashing keys, rate-limit identifiers, routing conditions,
//! etc.) should use [`ContextRef`] rather than implementing its own extraction.
//!
//! ## Supported tokens
//!
//! | Token | Description |
//! |---|---|
//! | `${{header.name}}` | Request header value |
//! | `${{query.key}}` | Query string parameter |
//! | `${{path-param.name}}` | Path parameter from OpenAPI template |
//! | `${{cookie.name}}` | Cookie value |
//! | `${{client-ip}}` | Client IP (peer address) |
//! | `${{path}}` | Full request path |
//! | `${{method}}` | HTTP method |

use std::collections::HashMap;

/// A parsed reference to a value in the request context.
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
    ClientIp,
    Path,
    Method,
}

impl ContextRef {
    /// Parse a `${{namespace.key}}` token string.
    ///
    /// Returns an error if the token is malformed or references an unknown namespace.
    pub fn parse(token: &str) -> Result<Self, String> {
        let inner = token
            .strip_prefix("${{")
            .and_then(|s| s.strip_suffix("}}"))
            .ok_or_else(|| {
                format!("invalid context token '{token}': must be wrapped in ${{{{...}}}}")
            })?;

        let inner = inner.trim();
        if inner.is_empty() {
            return Err("empty context token".to_string());
        }

        // Split on first '.' only — the key portion may itself contain dots (e.g. header names).
        let (namespace, key) = match inner.split_once('.') {
            Some((ns, k)) => (ns, Some(k)),
            None => (inner, None),
        };

        match namespace {
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
            "client-ip" => {
                if key.is_some() {
                    return Err("${{client-ip}} does not take a sub-key".to_string());
                }
                Ok(Self {
                    source: Source::ClientIp,
                })
            }
            "path" => {
                if key.is_some() {
                    return Err("${{path}} does not take a sub-key".to_string());
                }
                Ok(Self {
                    source: Source::Path,
                })
            }
            "method" => {
                if key.is_some() {
                    return Err("${{method}} does not take a sub-key".to_string());
                }
                Ok(Self {
                    source: Source::Method,
                })
            }
            other => Err(format!(
                "unknown context namespace '{other}'; expected one of: \
                 header, query, path-param, cookie, client-ip, path, method"
            )),
        }
    }

    /// Extract the referenced value from the request context.
    ///
    /// Returns `None` if the referenced value is absent (e.g. missing header).
    pub fn extract(
        &self,
        req: &pingora_http::RequestHeader,
        path_params: &HashMap<String, String>,
    ) -> Option<String> {
        match &self.source {
            Source::Header(name) => req
                .headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            Source::Query(key) => {
                let query_str = req.uri.query()?;
                form_urlencoded::parse(query_str.as_bytes())
                    .find(|(k, _)| k == key)
                    .map(|(_, v)| v.into_owned())
            }
            Source::PathParam(name) => path_params.get(name.as_str()).cloned(),
            Source::Cookie(name) => {
                let cookie_header = req.headers.get("cookie")?;
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
            Source::ClientIp => {
                // Prefer X-Forwarded-For if present, otherwise fall back to peer address.
                if let Some(xff) = req.headers.get("x-forwarded-for") {
                    if let Ok(s) = xff.to_str() {
                        // X-Forwarded-For may contain a comma-separated list; take the first.
                        return Some(s.split(',').next().unwrap_or(s).trim().to_string());
                    }
                }
                // Peer address is not available on RequestHeader; callers that need true
                // peer-addr should populate X-Forwarded-For upstream or use a different token.
                None
            }
            Source::Path => Some(req.uri.path().to_string()),
            Source::Method => Some(req.method.as_str().to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse tests ---

    #[test]
    fn parses_header_token() {
        let ctx = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(ctx.source, Source::Header("x-api-key".to_string()));
    }

    #[test]
    fn header_name_lowercased() {
        let ctx = ContextRef::parse("${{header.X-Api-Key}}").unwrap();
        assert_eq!(ctx.source, Source::Header("x-api-key".to_string()));
    }

    #[test]
    fn parses_query_token() {
        let ctx = ContextRef::parse("${{query.api_key}}").unwrap();
        assert_eq!(ctx.source, Source::Query("api_key".to_string()));
    }

    #[test]
    fn parses_path_param_token() {
        let ctx = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(ctx.source, Source::PathParam("id".to_string()));
    }

    #[test]
    fn parses_cookie_token() {
        let ctx = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(ctx.source, Source::Cookie("session".to_string()));
    }

    #[test]
    fn parses_client_ip_token() {
        let ctx = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(ctx.source, Source::ClientIp);
    }

    #[test]
    fn parses_path_token() {
        let ctx = ContextRef::parse("${{path}}").unwrap();
        assert_eq!(ctx.source, Source::Path);
    }

    #[test]
    fn parses_method_token() {
        let ctx = ContextRef::parse("${{method}}").unwrap();
        assert_eq!(ctx.source, Source::Method);
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
        let err = ContextRef::parse("${{body.name}}").unwrap_err();
        assert!(err.contains("unknown context namespace"), "got: {err}");
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
    fn rejects_client_ip_with_sub_key() {
        let err = ContextRef::parse("${{client-ip.something}}").unwrap_err();
        assert!(err.contains("does not take a sub-key"), "got: {err}");
    }

    #[test]
    fn rejects_path_with_sub_key() {
        assert!(ContextRef::parse("${{path.extra}}").is_err());
    }

    #[test]
    fn rejects_method_with_sub_key() {
        assert!(ContextRef::parse("${{method.extra}}").is_err());
    }

    // --- extract tests ---

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

    #[test]
    fn extracts_header_value() {
        let req = make_request("GET", "/test", vec![("x-api-key", "secret123")]);
        let ctx = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(
            ctx.extract(&req, &HashMap::new()),
            Some("secret123".to_string())
        );
    }

    #[test]
    fn extracts_missing_header_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let ctx = ContextRef::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), None);
    }

    #[test]
    fn extracts_query_parameter() {
        let req = make_request("GET", "/test?api_key=abc&other=1", vec![]);
        let ctx = ContextRef::parse("${{query.api_key}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), Some("abc".to_string()));
    }

    #[test]
    fn extracts_missing_query_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let ctx = ContextRef::parse("${{query.missing}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), None);
    }

    #[test]
    fn extracts_path_param() {
        let req = make_request("GET", "/users/42", vec![]);
        let mut params = HashMap::new();
        params.insert("id".to_string(), "42".to_string());
        let ctx = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(ctx.extract(&req, &params), Some("42".to_string()));
    }

    #[test]
    fn extracts_missing_path_param_as_none() {
        let req = make_request("GET", "/test", vec![]);
        let ctx = ContextRef::parse("${{path-param.id}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), None);
    }

    #[test]
    fn extracts_cookie_value() {
        let req = make_request(
            "GET",
            "/test",
            vec![("cookie", "session=abc123; theme=dark")],
        );
        let ctx = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(
            ctx.extract(&req, &HashMap::new()),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn extracts_missing_cookie_as_none() {
        let req = make_request("GET", "/test", vec![("cookie", "theme=dark")]);
        let ctx = ContextRef::parse("${{cookie.session}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), None);
    }

    #[test]
    fn extracts_client_ip_from_xff() {
        let req = make_request(
            "GET",
            "/test",
            vec![("x-forwarded-for", "1.2.3.4, 5.6.7.8")],
        );
        let ctx = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(
            ctx.extract(&req, &HashMap::new()),
            Some("1.2.3.4".to_string())
        );
    }

    #[test]
    fn client_ip_none_without_xff() {
        let req = make_request("GET", "/test", vec![]);
        let ctx = ContextRef::parse("${{client-ip}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), None);
    }

    #[test]
    fn extracts_path() {
        let req = make_request("GET", "/users/42?q=1", vec![]);
        let ctx = ContextRef::parse("${{path}}").unwrap();
        assert_eq!(
            ctx.extract(&req, &HashMap::new()),
            Some("/users/42".to_string())
        );
    }

    #[test]
    fn extracts_method() {
        let req = make_request("POST", "/test", vec![]);
        let ctx = ContextRef::parse("${{method}}").unwrap();
        assert_eq!(ctx.extract(&req, &HashMap::new()), Some("POST".to_string()));
    }
}
