//! OpenAPI 3.x query parameter deserialization.
//!
//! Parses raw query strings into typed JSON values using the serialization
//! rules defined by the [OpenAPI Specification v3.0/3.1][spec]:
//!
//! - `form` (default for query) with `explode: true` (default) or `false`
//! - `spaceDelimited` with `explode: true` or `false`
//! - `pipeDelimited` with `explode: true` or `false`
//! - `deepObject` with `explode: true`
//!
//! Scalar values are coerced to the JSON type declared in the parameter schema
//! (`integer`, `number`, `boolean`, or `string`).
//!
//! [spec]: https://spec.openapis.org/oas/v3.1.1#style-values

use std::collections::{HashMap, HashSet};

/// Serialization style for a query parameter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    /// Ampersand-separated values (default for query parameters).
    Form,
    /// Space-separated array values.
    SpaceDelimited,
    /// Pipe-separated array values.
    PipeDelimited,
    /// Nested object notation: `param[key]=value`.
    DeepObject,
}

/// JSON Schema type for a parameter or its items.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaType {
    String,
    Integer,
    Number,
    Boolean,
    Array,
    Object,
}

/// Definition of a single query parameter, extracted from an OpenAPI spec.
#[derive(Debug, Clone)]
pub struct ParameterDef {
    pub name: String,
    pub style: Style,
    pub explode: bool,
    pub schema_type: SchemaType,
    /// Schema type for array items. Defaults to `String` if not specified.
    pub items_type: Option<SchemaType>,
}

impl ParameterDef {
    /// Build a `ParameterDef` from a serialized OpenAPI Parameter JSON object.
    ///
    /// Applies OpenAPI defaults: `style` defaults to `"form"` for query params,
    /// `explode` defaults to `true` when style is `form`, `false` otherwise.
    /// Only parameters with `"in": "query"` are returned; others yield `None`.
    pub fn from_json(value: &serde_json::Value) -> Option<Self> {
        let obj = value.as_object()?;
        let location = obj.get("in")?.as_str()?;
        if location != "query" {
            return None;
        }
        let name = obj.get("name")?.as_str()?.to_string();

        let style = match obj.get("style").and_then(|v| v.as_str()) {
            Some("spaceDelimited") => Style::SpaceDelimited,
            Some("pipeDelimited") => Style::PipeDelimited,
            Some("deepObject") => Style::DeepObject,
            _ => Style::Form, // default for query
        };

        let explode = obj
            .get("explode")
            .and_then(|v| v.as_bool())
            .unwrap_or(style == Style::Form); // default: true for form, false otherwise

        let schema = obj.get("schema");
        let schema_type = schema_type_from_json(schema).unwrap_or(SchemaType::String);
        let items_type = schema
            .and_then(|s| s.get("items"))
            .and_then(|i| schema_type_from_json(Some(i)));

        Some(ParameterDef {
            name,
            style,
            explode,
            schema_type,
            items_type,
        })
    }
}

/// Extract `SchemaType` from a JSON schema object's `"type"` field.
fn schema_type_from_json(schema: Option<&serde_json::Value>) -> Option<SchemaType> {
    let type_str = schema?.get("type")?.as_str()?;
    match type_str {
        "integer" => Some(SchemaType::Integer),
        "number" => Some(SchemaType::Number),
        "boolean" => Some(SchemaType::Boolean),
        "array" => Some(SchemaType::Array),
        "object" => Some(SchemaType::Object),
        _ => Some(SchemaType::String),
    }
}

/// Coerce a raw string value to a JSON value based on the target schema type.
fn coerce_scalar(raw: &str, target: SchemaType) -> serde_json::Value {
    match target {
        SchemaType::Integer => raw
            .parse::<i64>()
            .map(serde_json::Value::from)
            .unwrap_or_else(|_| serde_json::Value::String(raw.to_string())),
        SchemaType::Number => raw
            .parse::<f64>()
            .map(|n| serde_json::Number::from_f64(n).map_or(serde_json::Value::Null, Into::into))
            .unwrap_or_else(|_| serde_json::Value::String(raw.to_string())),
        SchemaType::Boolean => match raw {
            "true" => serde_json::Value::Bool(true),
            "false" => serde_json::Value::Bool(false),
            _ => serde_json::Value::String(raw.to_string()),
        },
        _ => serde_json::Value::String(raw.to_string()),
    }
}

/// Parse a raw query string into a JSON object using OpenAPI parameter definitions.
///
/// Parameters defined in `params` are parsed according to their `style`, `explode`,
/// and `schema_type` settings. Query parameters present in the query string but not
/// defined in `params` are included as raw string values (pass-through).
///
/// # Examples
///
/// ```
/// use oas_query::{parse_query_params, ParameterDef, Style, SchemaType};
///
/// let params = vec![ParameterDef {
///     name: "page".to_string(),
///     style: Style::Form,
///     explode: true,
///     schema_type: SchemaType::Integer,
///     items_type: None,
/// }];
///
/// let result = parse_query_params("page=3&sort=name", &params);
/// assert_eq!(result["page"], 3);
/// assert_eq!(result["sort"], "name"); // undeclared param: raw string
/// ```
pub fn parse_query_params(
    query_string: &str,
    params: &[ParameterDef],
) -> serde_json::Map<std::string::String, serde_json::Value> {
    let mut result = serde_json::Map::new();

    if query_string.is_empty() {
        return result;
    }

    // Collect all raw key-value pairs from the query string.
    let pairs: Vec<(String, String)> = form_urlencoded::parse(query_string.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    // Index params by name for quick lookup.
    let param_map: HashMap<&str, &ParameterDef> =
        params.iter().map(|p| (p.name.as_str(), p)).collect();

    // Track which raw keys we've consumed so we can pass through undeclared ones.
    let mut consumed_keys: HashSet<String> = HashSet::new();

    // Pass 1: handle all params whose values are keyed by their own name.
    // Defer form+object+explode=true — those consume *other* keys and must run last.
    let mut deferred: Vec<&ParameterDef> = Vec::new();
    for def in params {
        if def.style == Style::Form && def.schema_type == SchemaType::Object && def.explode {
            deferred.push(def);
            continue;
        }
        let value = match def.style {
            Style::Form => parse_form(&pairs, def, &mut consumed_keys),
            Style::SpaceDelimited => parse_delimited(&pairs, def, ' ', &mut consumed_keys),
            Style::PipeDelimited => parse_delimited(&pairs, def, '|', &mut consumed_keys),
            Style::DeepObject => parse_deep_object(&pairs, def, &mut consumed_keys),
        };
        if let Some(v) = value {
            result.insert(def.name.clone(), v);
        }
    }

    // Pass 2: form+object+explode=true — collect all unconsumed non-bracket keys
    // as the object's properties. Per the spec, every top-level pair IS a property.
    for def in deferred {
        let obj: serde_json::Map<String, serde_json::Value> = pairs
            .iter()
            .filter(|(k, _)| {
                !consumed_keys.contains(k)
                    && !k.contains('[')
                    && !param_map.contains_key(k.as_str())
            })
            .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
            .collect();
        if !obj.is_empty() {
            for k in obj.keys() {
                consumed_keys.insert(k.clone());
            }
            result.insert(def.name.clone(), serde_json::Value::Object(obj));
        }
    }

    // Pass-through: include undeclared parameters as raw strings.
    // For repeated keys, collect into an array.
    let mut undeclared: HashMap<String, Vec<String>> = HashMap::new();
    for (k, v) in &pairs {
        if consumed_keys.contains(k) {
            continue;
        }
        // Also skip deep-object bracket keys that belong to a declared param.
        if let Some(bracket_pos) = k.find('[') {
            let base = &k[..bracket_pos];
            if param_map.contains_key(base) {
                continue;
            }
        }
        undeclared.entry(k.clone()).or_default().push(v.clone());
    }
    for (k, values) in undeclared {
        if values.len() == 1 {
            result.insert(
                k,
                serde_json::Value::String(values.into_iter().next().unwrap()),
            );
        } else {
            result.insert(
                k,
                serde_json::Value::Array(
                    values.into_iter().map(serde_json::Value::String).collect(),
                ),
            );
        }
    }

    result
}

/// Extract query parameter definitions from an OpenAPI `operation_meta` JSON value.
///
/// Filters the `"parameters"` array to only include `"in": "query"` entries.
pub fn extract_query_params(operation_meta: &serde_json::Value) -> Vec<ParameterDef> {
    operation_meta
        .get("parameters")
        .and_then(|p| p.as_array())
        .map(|arr| arr.iter().filter_map(ParameterDef::from_json).collect())
        .unwrap_or_default()
}

/// Parse a `form`-style parameter.
fn parse_form(
    pairs: &[(String, String)],
    def: &ParameterDef,
    consumed: &mut HashSet<String>,
) -> Option<serde_json::Value> {
    let matching: Vec<&str> = pairs
        .iter()
        .filter(|(k, _)| k == &def.name)
        .map(|(_, v)| v.as_str())
        .collect();

    if matching.is_empty() {
        return None;
    }
    consumed.insert(def.name.clone());

    let item_type = def.items_type.unwrap_or(SchemaType::String);

    match def.schema_type {
        SchemaType::Array => {
            if def.explode {
                // explode=true: ?color=blue&color=black → ["blue", "black"]
                let arr: Vec<serde_json::Value> = matching
                    .iter()
                    .map(|v| coerce_scalar(v, item_type))
                    .collect();
                Some(serde_json::Value::Array(arr))
            } else {
                // explode=false: ?color=blue,black → ["blue", "black"]
                let arr: Vec<serde_json::Value> = matching[0]
                    .split(',')
                    .map(|v| coerce_scalar(v, item_type))
                    .collect();
                Some(serde_json::Value::Array(arr))
            }
        }
        SchemaType::Object => {
            // explode=false: ?color=role,admin,firstName,Alex → { "role": "admin", "firstName": "Alex" }
            // explode=true is handled outside parse_form (two-pass approach in parse_query_params).
            parse_csv_object(matching[0])
        }
        _ => {
            // Primitive: single value with type coercion.
            Some(coerce_scalar(matching[0], def.schema_type))
        }
    }
}

/// Parse comma-separated key-value pairs into an object: `"k1,v1,k2,v2"` → `{ k1: v1, k2: v2 }`.
fn parse_csv_object(raw: &str) -> Option<serde_json::Value> {
    let parts: Vec<&str> = raw.split(',').collect();
    let mut obj = serde_json::Map::new();
    for chunk in parts.chunks(2) {
        if chunk.len() == 2 {
            obj.insert(
                chunk[0].to_string(),
                serde_json::Value::String(chunk[1].to_string()),
            );
        }
    }
    Some(serde_json::Value::Object(obj))
}

/// Parse a `spaceDelimited` or `pipeDelimited` parameter.
fn parse_delimited(
    pairs: &[(String, String)],
    def: &ParameterDef,
    delimiter: char,
    consumed: &mut HashSet<String>,
) -> Option<serde_json::Value> {
    let matching: Vec<&str> = pairs
        .iter()
        .filter(|(k, _)| k == &def.name)
        .map(|(_, v)| v.as_str())
        .collect();

    if matching.is_empty() {
        return None;
    }
    consumed.insert(def.name.clone());

    let item_type = def.items_type.unwrap_or(SchemaType::String);

    if def.explode {
        // explode=true for spaceDelimited/pipeDelimited behaves the same as form explode=true.
        let arr: Vec<serde_json::Value> = matching
            .iter()
            .map(|v| coerce_scalar(v, item_type))
            .collect();
        Some(serde_json::Value::Array(arr))
    } else {
        // explode=false: split by delimiter.
        let arr: Vec<serde_json::Value> = matching[0]
            .split(delimiter)
            .map(|v| coerce_scalar(v, item_type))
            .collect();
        Some(serde_json::Value::Array(arr))
    }
}

/// Parse a `deepObject`-style parameter: `?color[R]=100&color[G]=200` → `{ "R": "100", "G": "200" }`.
fn parse_deep_object(
    pairs: &[(String, String)],
    def: &ParameterDef,
    consumed: &mut HashSet<String>,
) -> Option<serde_json::Value> {
    let prefix = format!("{}[", def.name);
    let mut obj = serde_json::Map::new();

    for (k, v) in pairs {
        if let Some(rest) = k.strip_prefix(&prefix)
            && let Some(prop) = rest.strip_suffix(']')
        {
            obj.insert(prop.to_string(), serde_json::Value::String(v.clone()));
            consumed.insert(k.clone());
        }
    }

    if obj.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(obj))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn param(name: &str, style: Style, explode: bool, schema_type: SchemaType) -> ParameterDef {
        ParameterDef {
            name: name.to_string(),
            style,
            explode,
            schema_type,
            items_type: None,
        }
    }

    fn array_param(
        name: &str,
        style: Style,
        explode: bool,
        items_type: SchemaType,
    ) -> ParameterDef {
        ParameterDef {
            name: name.to_string(),
            style,
            explode,
            schema_type: SchemaType::Array,
            items_type: Some(items_type),
        }
    }

    // ---- Empty / missing ----

    #[test]
    fn empty_query_string() {
        let result = parse_query_params("", &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn no_params_defined() {
        let result = parse_query_params("foo=bar&baz=1", &[]);
        assert_eq!(result["foo"], "bar");
        assert_eq!(result["baz"], "1");
    }

    #[test]
    fn defined_param_not_in_query() {
        let params = vec![param("missing", Style::Form, true, SchemaType::String)];
        let result = parse_query_params("other=value", &params);
        assert!(result.get("missing").is_none());
        assert_eq!(result["other"], "value");
    }

    // ---- Form style, primitive ----

    #[test]
    fn form_primitive_string() {
        let params = vec![param("name", Style::Form, true, SchemaType::String)];
        let result = parse_query_params("name=alice", &params);
        assert_eq!(result["name"], "alice");
    }

    #[test]
    fn form_primitive_integer() {
        let params = vec![param("page", Style::Form, true, SchemaType::Integer)];
        let result = parse_query_params("page=42", &params);
        assert_eq!(result["page"], json!(42));
    }

    #[test]
    fn form_primitive_number() {
        let params = vec![param("score", Style::Form, true, SchemaType::Number)];
        let result = parse_query_params("score=3.14", &params);
        assert_eq!(result["score"], json!(3.14));
    }

    #[test]
    fn form_primitive_boolean_true() {
        let params = vec![param("active", Style::Form, true, SchemaType::Boolean)];
        let result = parse_query_params("active=true", &params);
        assert_eq!(result["active"], json!(true));
    }

    #[test]
    fn form_primitive_boolean_false() {
        let params = vec![param("active", Style::Form, true, SchemaType::Boolean)];
        let result = parse_query_params("active=false", &params);
        assert_eq!(result["active"], json!(false));
    }

    #[test]
    fn form_primitive_invalid_integer_kept_as_string() {
        let params = vec![param("page", Style::Form, true, SchemaType::Integer)];
        let result = parse_query_params("page=abc", &params);
        assert_eq!(result["page"], "abc");
    }

    // ---- Form style, array ----

    #[test]
    fn form_array_explode_true() {
        let params = vec![array_param("color", Style::Form, true, SchemaType::String)];
        let result = parse_query_params("color=blue&color=black&color=brown", &params);
        assert_eq!(result["color"], json!(["blue", "black", "brown"]));
    }

    #[test]
    fn form_array_explode_false() {
        let params = vec![array_param("color", Style::Form, false, SchemaType::String)];
        let result = parse_query_params("color=blue,black,brown", &params);
        assert_eq!(result["color"], json!(["blue", "black", "brown"]));
    }

    #[test]
    fn form_array_explode_true_with_integer_items() {
        let params = vec![array_param("id", Style::Form, true, SchemaType::Integer)];
        let result = parse_query_params("id=3&id=4&id=5", &params);
        assert_eq!(result["id"], json!([3, 4, 5]));
    }

    #[test]
    fn form_array_explode_false_with_integer_items() {
        let params = vec![array_param("id", Style::Form, false, SchemaType::Integer)];
        let result = parse_query_params("id=3,4,5", &params);
        assert_eq!(result["id"], json!([3, 4, 5]));
    }

    #[test]
    fn form_array_single_element() {
        let params = vec![array_param("color", Style::Form, true, SchemaType::String)];
        let result = parse_query_params("color=blue", &params);
        assert_eq!(result["color"], json!(["blue"]));
    }

    // ---- Form style, object ----

    #[test]
    fn form_object_explode_false() {
        let params = vec![param("color", Style::Form, false, SchemaType::Object)];
        let result = parse_query_params("color=role,admin,firstName,Alex", &params);
        assert_eq!(
            result["color"],
            json!({"role": "admin", "firstName": "Alex"})
        );
    }

    #[test]
    fn form_object_explode_true() {
        let params = vec![param("color", Style::Form, true, SchemaType::Object)];
        let result = parse_query_params("role=admin&firstName=Alex", &params);
        assert_eq!(
            result["color"],
            json!({"role": "admin", "firstName": "Alex"})
        );
    }

    // ---- Space-delimited ----

    #[test]
    fn space_delimited_explode_false() {
        let params = vec![array_param(
            "color",
            Style::SpaceDelimited,
            false,
            SchemaType::String,
        )];
        let result = parse_query_params("color=blue%20black%20brown", &params);
        assert_eq!(result["color"], json!(["blue", "black", "brown"]));
    }

    #[test]
    fn space_delimited_explode_true() {
        let params = vec![array_param(
            "color",
            Style::SpaceDelimited,
            true,
            SchemaType::String,
        )];
        let result = parse_query_params("color=blue&color=black", &params);
        assert_eq!(result["color"], json!(["blue", "black"]));
    }

    #[test]
    fn space_delimited_with_integer_items() {
        let params = vec![array_param(
            "id",
            Style::SpaceDelimited,
            false,
            SchemaType::Integer,
        )];
        let result = parse_query_params("id=3%204%205", &params);
        assert_eq!(result["id"], json!([3, 4, 5]));
    }

    // ---- Pipe-delimited ----

    #[test]
    fn pipe_delimited_explode_false() {
        let params = vec![array_param(
            "color",
            Style::PipeDelimited,
            false,
            SchemaType::String,
        )];
        let result = parse_query_params("color=blue|black|brown", &params);
        assert_eq!(result["color"], json!(["blue", "black", "brown"]));
    }

    #[test]
    fn pipe_delimited_explode_true() {
        let params = vec![array_param(
            "color",
            Style::PipeDelimited,
            true,
            SchemaType::String,
        )];
        let result = parse_query_params("color=blue&color=black", &params);
        assert_eq!(result["color"], json!(["blue", "black"]));
    }

    #[test]
    fn pipe_delimited_with_integer_items() {
        let params = vec![array_param(
            "id",
            Style::PipeDelimited,
            false,
            SchemaType::Integer,
        )];
        let result = parse_query_params("id=3|4|5", &params);
        assert_eq!(result["id"], json!([3, 4, 5]));
    }

    // ---- Deep object ----

    #[test]
    fn deep_object_basic() {
        let params = vec![param("color", Style::DeepObject, true, SchemaType::Object)];
        let result = parse_query_params("color[R]=100&color[G]=200&color[B]=150", &params);
        assert_eq!(result["color"], json!({"R": "100", "G": "200", "B": "150"}));
    }

    #[test]
    fn deep_object_missing() {
        let params = vec![param("filter", Style::DeepObject, true, SchemaType::Object)];
        let result = parse_query_params("other=value", &params);
        assert!(result.get("filter").is_none());
        assert_eq!(result["other"], "value");
    }

    #[test]
    fn deep_object_single_property() {
        let params = vec![param("filter", Style::DeepObject, true, SchemaType::Object)];
        let result = parse_query_params("filter[name]=alice", &params);
        assert_eq!(result["filter"], json!({"name": "alice"}));
    }

    // ---- Undeclared params pass-through ----

    #[test]
    fn undeclared_params_pass_through() {
        let params = vec![param("page", Style::Form, true, SchemaType::Integer)];
        let result = parse_query_params("page=1&sort=name&order=asc", &params);
        assert_eq!(result["page"], json!(1));
        assert_eq!(result["sort"], "name");
        assert_eq!(result["order"], "asc");
    }

    #[test]
    fn undeclared_repeated_params_become_array() {
        let result = parse_query_params("tag=a&tag=b&tag=c", &[]);
        assert_eq!(result["tag"], json!(["a", "b", "c"]));
    }

    // ---- URL encoding ----

    #[test]
    fn url_encoded_values() {
        let params = vec![param("q", Style::Form, true, SchemaType::String)];
        let result = parse_query_params("q=hello%20world", &params);
        assert_eq!(result["q"], "hello world");
    }

    #[test]
    fn url_encoded_keys() {
        let result = parse_query_params("my%20key=value", &[]);
        assert_eq!(result["my key"], "value");
    }

    // ---- Multiple params ----

    #[test]
    fn multiple_params_different_styles() {
        let params = vec![
            param("page", Style::Form, true, SchemaType::Integer),
            array_param("color", Style::PipeDelimited, false, SchemaType::String),
            param("filter", Style::DeepObject, true, SchemaType::Object),
        ];
        let result = parse_query_params(
            "page=2&color=red|green&filter[status]=active&extra=yes",
            &params,
        );
        assert_eq!(result["page"], json!(2));
        assert_eq!(result["color"], json!(["red", "green"]));
        assert_eq!(result["filter"], json!({"status": "active"}));
        assert_eq!(result["extra"], "yes");
    }

    // ---- ParameterDef::from_json ----

    #[test]
    fn from_json_basic_query_param() {
        let json = json!({
            "name": "limit",
            "in": "query",
            "schema": { "type": "integer" }
        });
        let def = ParameterDef::from_json(&json).unwrap();
        assert_eq!(def.name, "limit");
        assert_eq!(def.style, Style::Form);
        assert!(def.explode); // default for form
        assert_eq!(def.schema_type, SchemaType::Integer);
    }

    #[test]
    fn from_json_with_explicit_style() {
        let json = json!({
            "name": "color",
            "in": "query",
            "style": "pipeDelimited",
            "explode": false,
            "schema": { "type": "array", "items": { "type": "string" } }
        });
        let def = ParameterDef::from_json(&json).unwrap();
        assert_eq!(def.style, Style::PipeDelimited);
        assert!(!def.explode);
        assert_eq!(def.schema_type, SchemaType::Array);
        assert_eq!(def.items_type, Some(SchemaType::String));
    }

    #[test]
    fn from_json_deep_object() {
        let json = json!({
            "name": "filter",
            "in": "query",
            "style": "deepObject",
            "schema": { "type": "object" }
        });
        let def = ParameterDef::from_json(&json).unwrap();
        assert_eq!(def.style, Style::DeepObject);
        assert!(!def.explode); // default for non-form
        assert_eq!(def.schema_type, SchemaType::Object);
    }

    #[test]
    fn from_json_skips_path_param() {
        let json = json!({
            "name": "id",
            "in": "path",
            "schema": { "type": "integer" }
        });
        assert!(ParameterDef::from_json(&json).is_none());
    }

    #[test]
    fn from_json_skips_header_param() {
        let json = json!({
            "name": "x-api-key",
            "in": "header",
            "schema": { "type": "string" }
        });
        assert!(ParameterDef::from_json(&json).is_none());
    }

    #[test]
    fn from_json_defaults_to_string_when_no_schema() {
        let json = json!({
            "name": "q",
            "in": "query"
        });
        let def = ParameterDef::from_json(&json).unwrap();
        assert_eq!(def.schema_type, SchemaType::String);
    }

    // ---- extract_query_params ----

    #[test]
    fn extract_filters_to_query_only() {
        let meta = json!({
            "parameters": [
                { "name": "id", "in": "path", "schema": { "type": "integer" } },
                { "name": "limit", "in": "query", "schema": { "type": "integer" } },
                { "name": "x-api-key", "in": "header", "schema": { "type": "string" } },
                { "name": "q", "in": "query", "schema": { "type": "string" } },
            ]
        });
        let defs = extract_query_params(&meta);
        assert_eq!(defs.len(), 2);
        assert_eq!(defs[0].name, "limit");
        assert_eq!(defs[1].name, "q");
    }

    #[test]
    fn extract_empty_when_no_parameters() {
        let meta = json!({ "operationId": "test" });
        let defs = extract_query_params(&meta);
        assert!(defs.is_empty());
    }

    // ---- Integration: from_json + parse_query_params ----

    #[test]
    fn end_to_end_with_json_defs() {
        let meta = json!({
            "parameters": [
                { "name": "page", "in": "query", "schema": { "type": "integer" } },
                {
                    "name": "tags",
                    "in": "query",
                    "style": "form",
                    "explode": false,
                    "schema": { "type": "array", "items": { "type": "string" } }
                },
                { "name": "id", "in": "path", "schema": { "type": "integer" } },
            ]
        });
        let defs = extract_query_params(&meta);
        let result = parse_query_params("page=3&tags=a,b,c&extra=yes", &defs);
        assert_eq!(result["page"], json!(3));
        assert_eq!(result["tags"], json!(["a", "b", "c"]));
        assert_eq!(result["extra"], "yes");
    }

    #[test]
    fn end_to_end_deep_object() {
        let meta = json!({
            "parameters": [{
                "name": "filter",
                "in": "query",
                "style": "deepObject",
                "explode": true,
                "schema": { "type": "object" }
            }]
        });
        let defs = extract_query_params(&meta);
        let result = parse_query_params("filter[name]=alice&filter[age]=30", &defs);
        assert_eq!(result["filter"], json!({"name": "alice", "age": "30"}));
    }
}
