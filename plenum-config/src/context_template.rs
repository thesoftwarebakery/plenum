use crate::context_ref::{ContextRef, ExtractionCtx};
use crate::interpolation::{Template, TemplatePart};
use crate::request_data::RequestData;

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
    pub fn resolve<R: RequestData>(&self, cx: &ExtractionCtx<'_, R>) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request_data::RequestData;
    use serde_json::json;
    use std::collections::HashMap;

    struct TestRequest {
        method: String,
        path: String,
        query: Option<String>,
        headers: Vec<(String, String)>,
    }

    impl TestRequest {
        fn new(method: &str, uri: &str) -> Self {
            let (path, query) = match uri.split_once('?') {
                Some((p, q)) => (p.to_string(), Some(q.to_string())),
                None => (uri.to_string(), None),
            };
            Self {
                method: method.to_string(),
                path,
                query,
                headers: Vec::new(),
            }
        }

        fn with_header(mut self, name: &str, value: &str) -> Self {
            self.headers.push((name.to_lowercase(), value.to_string()));
            self
        }
    }

    impl RequestData for TestRequest {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.as_str())
        }
        fn uri_path(&self) -> &str {
            &self.path
        }
        fn uri_query(&self) -> Option<&str> {
            self.query.as_deref()
        }
        fn method(&self) -> &str {
            &self.method
        }
    }

    fn cx<'a>(
        req: &'a TestRequest,
        path_params: &'a HashMap<String, serde_json::Value>,
    ) -> ExtractionCtx<'a, &'a TestRequest> {
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
        req: &'a TestRequest,
        path_params: &'a HashMap<String, serde_json::Value>,
        user_ctx: &'a serde_json::Map<String, serde_json::Value>,
    ) -> ExtractionCtx<'a, &'a TestRequest> {
        ExtractionCtx {
            req,
            path_params,
            user_ctx: Some(user_ctx),
            peer_addr: None,
            query_params: None,
            body_json: None,
        }
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
        assert_eq!(t.template.parts().len(), 3);
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
        let req = TestRequest::new("GET", "/test").with_header("x-api-key", "key-123");
        let params = HashMap::new();
        let t = ContextTemplate::parse("${{header.x-api-key}}").unwrap();
        assert_eq!(t.resolve(&cx(&req, &params)), Some("key-123".to_string()));
    }

    #[test]
    fn template_resolves_composite() {
        let req = TestRequest::new("GET", "/test").with_header("x-tenant", "acme");
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
        let req = TestRequest::new("GET", "/test");
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
