use std::collections::HashMap;

// ── File descriptor ───────────────────────────────────────────────────────

/// A file declared in `x-plenum-files`, storing both its resolved absolute
/// path and its contents. Accessed in templates via `${{ file.NAME.path }}`
/// or `${{ file.NAME.content }}`. An accessor is always required.
#[derive(Debug, Clone)]
pub struct FileEntry {
    /// Resolved absolute path to the file on disk.
    pub path: String,
    /// File contents (trailing newline stripped).
    pub content: String,
}

// ── Shared template parser ──────────────────────────────────────────────────

/// A single parsed `${{ namespace.key }}` token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    /// The namespace portion (e.g. `"env"`, `"header"`, `"ctx"`).
    pub namespace: String,
    /// Everything after the first `.`, or empty if there is no dot
    /// (e.g. `"client-ip"`, `"method"`).
    pub key: String,
}

/// One segment of a parsed template string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplatePart {
    /// Literal text between tokens.
    Literal(String),
    /// A parsed `${{ namespace.key }}` expression.
    Expr(Token),
}

/// A parsed template string containing zero or more `${{ … }}` expressions
/// interspersed with literal text.
///
/// This is the shared parser used by both boot-time interpolation (`env`,
/// `file`) and runtime context resolution (`header`, `query`, `ctx`, etc.).
#[derive(Debug, Clone)]
pub struct Template {
    original: String,
    parts: Vec<TemplatePart>,
}

impl Template {
    /// Parse a template string into its constituent parts.
    ///
    /// Returns an error only on malformed syntax (unclosed `${{`). Unknown
    /// namespaces are accepted — validation is the caller's responsibility.
    pub fn parse(template: &str) -> Result<Self, String> {
        let mut parts: Vec<TemplatePart> = Vec::new();
        let mut remaining = template;

        loop {
            let Some(start) = remaining.find("${{") else {
                if !remaining.is_empty() {
                    parts.push(TemplatePart::Literal(remaining.to_string()));
                }
                break;
            };

            if start > 0 {
                parts.push(TemplatePart::Literal(remaining[..start].to_string()));
            }

            let after_open = &remaining[start + 3..];
            let end = after_open
                .find("}}")
                .ok_or_else(|| format!("unclosed '${{{{' in template: {template}"))?;

            let inner = after_open[..end].trim();
            remaining = &after_open[end + 2..];

            if inner.is_empty() {
                return Err("empty ${{ }} token".to_string());
            }

            let (namespace, key) = match inner.split_once('.') {
                Some((ns, k)) => (ns.to_string(), k.to_string()),
                None => (inner.to_string(), String::new()),
            };

            parts.push(TemplatePart::Expr(Token { namespace, key }));
        }

        Ok(Self {
            original: template.to_string(),
            parts,
        })
    }

    /// Returns the parsed parts.
    pub fn parts(&self) -> &[TemplatePart] {
        &self.parts
    }

    /// Returns whether the template contains at least one expression.
    pub fn has_expressions(&self) -> bool {
        self.parts
            .iter()
            .any(|p| matches!(p, TemplatePart::Expr(_)))
    }

    /// Returns the original template string as written in configuration.
    pub fn as_str(&self) -> &str {
        &self.original
    }
}

impl std::fmt::Display for Template {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.original)
    }
}

// ── Boot-time interpolation ─────────────────────────────────────────────────

/// Recursively walk a JSON value, interpolating `${{ namespace.key }}` tokens
/// in all string values. Objects and arrays are traversed; other types pass
/// through unchanged.
///
/// Boot-time namespaces resolved here:
///   - `env`  — process environment variables
///   - `file` — entries from the `x-plenum-files` map (accessor required):
///     - `${{ file.NAME.content }}` — file contents
///     - `${{ file.NAME.path }}` — resolved absolute file path
///
/// Any other namespace (e.g. `header`, `query`, `ctx`) is left as-is for
/// runtime resolution.
pub fn interpolate_value(
    value: serde_json::Value,
    files: &HashMap<String, FileEntry>,
) -> Result<serde_json::Value, String> {
    match value {
        serde_json::Value::String(s) => {
            Ok(serde_json::Value::String(interpolate_string(&s, files)?))
        }
        serde_json::Value::Object(map) => {
            let new_map = map
                .into_iter()
                .map(|(k, v)| interpolate_value(v, files).map(|v| (k, v)))
                .collect::<Result<_, _>>()?;
            Ok(serde_json::Value::Object(new_map))
        }
        serde_json::Value::Array(arr) => {
            let new_arr = arr
                .into_iter()
                .map(|v| interpolate_value(v, files))
                .collect::<Result<_, _>>()?;
            Ok(serde_json::Value::Array(new_arr))
        }
        other => Ok(other),
    }
}

/// Interpolate boot-time tokens in a single string using the shared
/// [`Template`] parser. Resolves `env` and `file` namespaces; passes
/// through all others as literal text.
fn interpolate_string(s: &str, files: &HashMap<String, FileEntry>) -> Result<String, String> {
    let template = Template::parse(s)?;
    let mut result = String::with_capacity(s.len());

    for part in template.parts() {
        match part {
            TemplatePart::Literal(lit) => result.push_str(lit),
            TemplatePart::Expr(token) => match token.namespace.as_str() {
                "env" => match std::env::var(&token.key) {
                    Ok(val) => result.push_str(&val),
                    Err(_) => {
                        return Err(format!("environment variable '{}' is not set", token.key));
                    }
                },
                "file" => {
                    result.push_str(&resolve_file_token(&token.key, files)?);
                }
                _ => {
                    // Unknown namespace — reconstruct original token for runtime
                    result.push_str("${{");
                    if token.key.is_empty() {
                        result.push_str(&token.namespace);
                    } else {
                        result.push_str(&token.namespace);
                        result.push('.');
                        result.push_str(&token.key);
                    }
                    result.push_str("}}");
                }
            },
        }
    }

    Ok(result)
}

/// Resolve a `file` namespace token key against the files map.
///
/// An accessor is always required:
///   - `NAME.content` → file contents
///   - `NAME.path` → resolved absolute path
///
/// Bare `NAME` (without accessor) is an error. When the key contains a dot,
/// we first check if the full key exists as a file entry (to reject bare
/// usage with a helpful message). If not, we split on the last dot to
/// extract an accessor.
fn resolve_file_token(key: &str, files: &HashMap<String, FileEntry>) -> Result<String, String> {
    // Bare `${{ file.NAME }}` without an accessor is an error.
    if files.contains_key(key) {
        return Err(format!(
            "file token '{key}' requires an accessor \
             (use ${{{{ file.{key}.content }}}} or ${{{{ file.{key}.path }}}})"
        ));
    }

    // Split on the last dot to extract an accessor.
    if let Some((name, accessor)) = key.rsplit_once('.')
        && let Some(entry) = files.get(name)
    {
        return match accessor {
            "content" => Ok(entry.content.clone()),
            "path" => Ok(entry.path.clone()),
            _ => Err(format!(
                "unknown file accessor '.{accessor}' on '{name}' \
                 (valid: .content, .path)"
            )),
        };
    }

    Err(format!("file key '{}' not found in x-plenum-files", key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── Template parser tests ────────────────────────────────────────────────

    #[test]
    fn template_parses_single_expr() {
        let t = Template::parse("${{ header.x-api-key }}").unwrap();
        assert_eq!(t.parts().len(), 1);
        assert!(matches!(
            &t.parts()[0],
            TemplatePart::Expr(Token { namespace, key })
                if namespace == "header" && key == "x-api-key"
        ));
    }

    #[test]
    fn template_parses_composite() {
        let t = Template::parse("${{header.x-tenant}}-${{ctx.userId}}").unwrap();
        assert_eq!(t.parts().len(), 3);
        assert!(matches!(&t.parts()[0], TemplatePart::Expr(_)));
        assert!(matches!(&t.parts()[1], TemplatePart::Literal(s) if s == "-"));
        assert!(matches!(&t.parts()[2], TemplatePart::Expr(_)));
    }

    #[test]
    fn template_parses_no_dot_token() {
        let t = Template::parse("${{ client-ip }}").unwrap();
        assert!(matches!(
            &t.parts()[0],
            TemplatePart::Expr(Token { namespace, key })
                if namespace == "client-ip" && key.is_empty()
        ));
    }

    #[test]
    fn template_rejects_unclosed() {
        assert!(Template::parse("${{ header.x").is_err());
    }

    #[test]
    fn template_rejects_empty_token() {
        assert!(Template::parse("${{ }}").is_err());
    }

    #[test]
    fn template_plain_string() {
        let t = Template::parse("no tokens here").unwrap();
        assert!(!t.has_expressions());
        assert_eq!(t.parts().len(), 1);
        assert!(matches!(&t.parts()[0], TemplatePart::Literal(s) if s == "no tokens here"));
    }

    #[test]
    fn template_preserves_original() {
        let s = "${{header.x-tenant}}-${{ctx.userId}}";
        let t = Template::parse(s).unwrap();
        assert_eq!(t.as_str(), s);
    }

    #[test]
    fn template_whitespace_variants() {
        let t1 = Template::parse("${{env.X}}").unwrap();
        let t2 = Template::parse("${{  env.X  }}").unwrap();
        let t3 = Template::parse("${{ env.X }}").unwrap();
        // All should parse the same token
        for t in [&t1, &t2, &t3] {
            assert!(matches!(
                &t.parts()[0],
                TemplatePart::Expr(Token { namespace, key })
                    if namespace == "env" && key == "X"
            ));
        }
    }

    // ── Boot-time interpolation tests ────────────────────────────────────────

    #[test]
    fn env_var_present() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_A", "hello") };
        let result = interpolate_string("${{ env.PLENUM_TEST_INTERP_A }}", &HashMap::new());
        assert_eq!(result.unwrap(), "hello");
    }

    #[test]
    fn env_var_missing() {
        unsafe { std::env::remove_var("PLENUM_TEST_INTERP_MISSING") };
        let result = interpolate_string("${{ env.PLENUM_TEST_INTERP_MISSING }}", &HashMap::new());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("PLENUM_TEST_INTERP_MISSING"));
        assert!(err.contains("is not set"));
    }

    #[test]
    fn env_var_empty_string() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_EMPTY", "") };
        let result = interpolate_string("${{ env.PLENUM_TEST_INTERP_EMPTY }}", &HashMap::new());
        assert_eq!(result.unwrap(), "");
    }

    fn file_entry(path: &str, content: &str) -> FileEntry {
        FileEntry {
            path: path.to_string(),
            content: content.to_string(),
        }
    }

    #[test]
    fn file_key_bare_requires_accessor() {
        let mut files = HashMap::new();
        files.insert(
            "MY_CERT".to_string(),
            file_entry("/certs/my.crt", "cert-contents"),
        );
        let result = interpolate_string("${{ file.MY_CERT }}", &files);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires an accessor"));
    }

    #[test]
    fn file_key_content_accessor() {
        let mut files = HashMap::new();
        files.insert(
            "MY_CERT".to_string(),
            file_entry("/certs/my.crt", "cert-contents"),
        );
        let result = interpolate_string("${{ file.MY_CERT.content }}", &files);
        assert_eq!(result.unwrap(), "cert-contents");
    }

    #[test]
    fn file_key_path_accessor() {
        let mut files = HashMap::new();
        files.insert(
            "MY_CERT".to_string(),
            file_entry("/certs/my.crt", "cert-contents"),
        );
        let result = interpolate_string("${{ file.MY_CERT.path }}", &files);
        assert_eq!(result.unwrap(), "/certs/my.crt");
    }

    #[test]
    fn file_key_unknown_accessor() {
        let mut files = HashMap::new();
        files.insert(
            "MY_CERT".to_string(),
            file_entry("/certs/my.crt", "cert-contents"),
        );
        let result = interpolate_string("${{ file.MY_CERT.unknown }}", &files);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown file accessor"));
    }

    #[test]
    fn file_key_missing() {
        let result = interpolate_string("${{ file.NOPE }}", &HashMap::new());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("NOPE"));
    }

    #[test]
    fn mixed_env_and_file() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_MIX", "world") };
        let mut files = HashMap::new();
        files.insert("GREETING".to_string(), file_entry("/greet.txt", "hello"));
        let result = interpolate_string(
            "${{ file.GREETING.content }}_${{ env.PLENUM_TEST_INTERP_MIX }}",
            &files,
        );
        assert_eq!(result.unwrap(), "hello_world");
    }

    #[test]
    fn unknown_namespace_passed_through() {
        let result = interpolate_string("prefix_${{ header.x-api-key }}_suffix", &HashMap::new());
        assert_eq!(result.unwrap(), "prefix_${{header.x-api-key}}_suffix");
    }

    #[test]
    fn no_pattern_unchanged() {
        let result = interpolate_string("just a plain string", &HashMap::new());
        assert_eq!(result.unwrap(), "just a plain string");
    }

    #[test]
    fn whitespace_variants() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_WS", "val") };
        let r1 = interpolate_string("${{env.PLENUM_TEST_INTERP_WS}}", &HashMap::new());
        assert_eq!(r1.unwrap(), "val");
        let r2 = interpolate_string("${{  env.PLENUM_TEST_INTERP_WS  }}", &HashMap::new());
        assert_eq!(r2.unwrap(), "val");
    }

    #[test]
    fn recursive_value_walk() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_REC", "resolved") };
        let value = json!({
            "address": "${{ env.PLENUM_TEST_INTERP_REC }}",
            "port": 8080,
            "tags": ["${{ env.PLENUM_TEST_INTERP_REC }}", "literal"],
            "nested": {
                "inner": "${{ env.PLENUM_TEST_INTERP_REC }}"
            },
            "flag": true,
            "nothing": null
        });
        let result = interpolate_value(value, &HashMap::new()).unwrap();
        assert_eq!(result["address"], "resolved");
        assert_eq!(result["port"], 8080);
        assert_eq!(result["tags"][0], "resolved");
        assert_eq!(result["tags"][1], "literal");
        assert_eq!(result["nested"]["inner"], "resolved");
        assert_eq!(result["flag"], true);
        assert!(result["nothing"].is_null());
    }

    #[test]
    fn non_string_values_pass_through() {
        let value = json!(42);
        let result = interpolate_value(value, &HashMap::new()).unwrap();
        assert_eq!(result, 42);

        let value = json!(true);
        let result = interpolate_value(value, &HashMap::new()).unwrap();
        assert_eq!(result, true);

        let value = json!(null);
        let result = interpolate_value(value, &HashMap::new()).unwrap();
        assert!(result.is_null());
    }

    #[test]
    fn env_var_in_middle_of_string() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_MID", "core") };
        let result = interpolate_string(
            "https://${{ env.PLENUM_TEST_INTERP_MID }}.example.com:443",
            &HashMap::new(),
        );
        assert_eq!(result.unwrap(), "https://core.example.com:443");
    }
}
