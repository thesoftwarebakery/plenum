//! Pre-compiled config tree where bare `${{...}}` string tokens have been
//! compiled to [`ContextRef`]s at load time, enabling cheap per-request
//! resolution with no string parsing.

use crate::config::interpolation::{Template, TemplatePart};
use crate::request_context::{ContextRef, ContextTemplate, ExtractionCtx};

/// A pre-compiled form of [`serde_json::Value`] where bare `${{...}}` strings
/// are compiled to [`ContextRef`]s at config-load time.
///
/// Build once via [`ConfigValue::from_json`]; resolve cheaply per-request via
/// [`ConfigValue::resolve`].
#[derive(Debug, Clone)]
pub enum ConfigValue {
    Null,
    Bool(bool),
    Number(serde_json::Number),
    /// Plain string literal with no tokens.
    Str(String),
    /// Bare single `${{namespace.key}}` expression. Resolves to a typed
    /// [`serde_json::Value`] so integer/boolean query params preserve their
    /// type when forwarded as DB query parameters.
    Token(ContextRef),
    /// Mixed template string — one or more tokens with surrounding literal
    /// text. Always resolves to [`serde_json::Value::String`].
    Template(ContextTemplate),
    Array(Vec<ConfigValue>),
    Object(Vec<(String, ConfigValue)>),
}

impl ConfigValue {
    /// Recursively compile a `serde_json::Value` at config-load time.
    ///
    /// String values that are a bare single `${{...}}` token are compiled to
    /// [`ConfigValue::Token`]. Mixed strings (tokens + literal text) become
    /// [`ConfigValue::Template`]. Strings with an unrecognised namespace are
    /// left as [`ConfigValue::Str`] so they pass through unchanged.
    pub fn from_json(v: &serde_json::Value) -> Self {
        match v {
            serde_json::Value::Null => Self::Null,
            serde_json::Value::Bool(b) => Self::Bool(*b),
            serde_json::Value::Number(n) => Self::Number(n.clone()),
            serde_json::Value::String(s) => Self::compile_string(s),
            serde_json::Value::Array(arr) => Self::Array(arr.iter().map(Self::from_json).collect()),
            serde_json::Value::Object(obj) => Self::Object(
                obj.iter()
                    .map(|(k, v)| (k.clone(), Self::from_json(v)))
                    .collect(),
            ),
        }
    }

    fn compile_string(s: &str) -> Self {
        let Ok(template) = Template::parse(s) else {
            return Self::Str(s.to_string());
        };
        if !template.has_expressions() {
            return Self::Str(s.to_string());
        }
        let parts = template.parts();
        // Bare single token: exactly one expression part, nothing else.
        if parts.len() == 1
            && let TemplatePart::Expr(token) = &parts[0]
            && let Ok(ctx_ref) = ContextRef::from_token(token)
        {
            return Self::Token(ctx_ref);
        }
        // Mixed template — try to compile; fall back to literal on failure
        // (e.g. unknown namespace in one of the expressions).
        if let Ok(tmpl) = ContextTemplate::parse(s) {
            return Self::Template(tmpl);
        }
        Self::Str(s.to_string())
    }

    /// Resolve all tokens against the request context.
    ///
    /// Missing values (absent header, body not buffered, etc.) resolve to
    /// [`serde_json::Value::Null`] — this method never panics.
    pub fn resolve(&self, cx: &ExtractionCtx<'_>) -> serde_json::Value {
        match self {
            Self::Null => serde_json::Value::Null,
            Self::Bool(b) => serde_json::Value::Bool(*b),
            Self::Number(n) => serde_json::Value::Number(n.clone()),
            Self::Str(s) => serde_json::Value::String(s.clone()),
            Self::Token(r) => r.extract_value(cx).unwrap_or(serde_json::Value::Null),
            Self::Template(t) => t
                .resolve(cx)
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
            Self::Array(arr) => {
                serde_json::Value::Array(arr.iter().map(|v| v.resolve(cx)).collect())
            }
            Self::Object(obj) => serde_json::Value::Object(
                obj.iter()
                    .map(|(k, v)| (k.clone(), v.resolve(cx)))
                    .collect(),
            ),
        }
    }
}
