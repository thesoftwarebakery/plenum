use std::collections::HashMap;

/// Recursively walk a JSON value, interpolating `${{ namespace.key }}` tokens
/// in all string values. Objects and arrays are traversed; other types pass
/// through unchanged.
///
/// Boot-time namespaces resolved here:
///   - `env`  — process environment variables
///   - `file` — entries from the `x-plenum-files` map (pre-loaded file contents)
///
/// Any other namespace (e.g. `header`, `query`, `ctx`) is left as-is for
/// runtime resolution.
pub fn interpolate_value(
    value: serde_json::Value,
    files: &HashMap<String, String>,
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

/// Interpolate `${{ namespace.key }}` tokens in a single string.
///
/// The parser scans for `${{` … `}}` pairs. For each token the content is
/// trimmed of whitespace, then split on the first `.` to yield a namespace and
/// key. Resolution depends on the namespace:
///
///   - `env`  — looked up in the process environment; error if unset
///   - `file` — looked up in the provided `files` map; error if missing
///   - anything else — left as the original literal (runtime token)
fn interpolate_string(s: &str, files: &HashMap<String, String>) -> Result<String, String> {
    let mut result = String::with_capacity(s.len());
    let mut remaining = s;

    loop {
        let Some(start) = remaining.find("${{") else {
            result.push_str(remaining);
            break;
        };

        result.push_str(&remaining[..start]);

        let after_open = &remaining[start + 3..];
        let Some(end) = after_open.find("}}") else {
            // Unclosed ${{ — treat as literal text
            result.push_str("${{");
            remaining = after_open;
            continue;
        };

        let token = after_open[..end].trim();
        remaining = &after_open[end + 2..];

        let Some((namespace, key)) = token.split_once('.') else {
            // No dot — not a namespaced token, pass through as literal
            result.push_str("${{");
            result.push_str(&after_open[..end]);
            result.push_str("}}");
            continue;
        };

        match namespace {
            "env" => match std::env::var(key) {
                Ok(val) => result.push_str(&val),
                Err(_) => {
                    return Err(format!("environment variable '{}' is not set", key,));
                }
            },
            "file" => match files.get(key) {
                Some(contents) => result.push_str(contents),
                None => {
                    return Err(format!("file key '{}' not found in x-plenum-files", key,));
                }
            },
            _ => {
                // Unknown namespace — leave token as-is for runtime resolution
                result.push_str("${{");
                result.push_str(&after_open[..end]);
                result.push_str("}}");
            }
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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

    #[test]
    fn file_key_present() {
        let mut files = HashMap::new();
        files.insert("MY_CERT".to_string(), "cert-contents".to_string());
        let result = interpolate_string("${{ file.MY_CERT }}", &files);
        assert_eq!(result.unwrap(), "cert-contents");
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
        files.insert("GREETING".to_string(), "hello".to_string());
        let result = interpolate_string(
            "${{ file.GREETING }}_${{ env.PLENUM_TEST_INTERP_MIX }}",
            &files,
        );
        assert_eq!(result.unwrap(), "hello_world");
    }

    #[test]
    fn unknown_namespace_passed_through() {
        let result = interpolate_string("prefix_${{ header.x-api-key }}_suffix", &HashMap::new());
        assert_eq!(result.unwrap(), "prefix_${{ header.x-api-key }}_suffix");
    }

    #[test]
    fn no_pattern_unchanged() {
        let result = interpolate_string("just a plain string", &HashMap::new());
        assert_eq!(result.unwrap(), "just a plain string");
    }

    #[test]
    fn whitespace_variants() {
        unsafe { std::env::set_var("PLENUM_TEST_INTERP_WS", "val") };
        // No spaces
        let r1 = interpolate_string("${{env.PLENUM_TEST_INTERP_WS}}", &HashMap::new());
        assert_eq!(r1.unwrap(), "val");
        // Extra spaces
        let r2 = interpolate_string("${{  env.PLENUM_TEST_INTERP_WS  }}", &HashMap::new());
        assert_eq!(r2.unwrap(), "val");
    }

    #[test]
    fn unclosed_token_treated_as_literal() {
        let result = interpolate_string("prefix ${{ env.SOME trailing", &HashMap::new());
        assert_eq!(result.unwrap(), "prefix ${{ env.SOME trailing");
    }

    #[test]
    fn no_dot_treated_as_literal() {
        let result = interpolate_string("${{ nodot }}", &HashMap::new());
        assert_eq!(result.unwrap(), "${{ nodot }}");
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
