use std::collections::HashSet;

use oas3::spec::{Operation, Spec};

/// Build a curated OpenAPI Operation Object JSON value for runtime use.
///
/// Includes operationId, summary, parameters, requestBody, responses, and bundled
/// component schemas for any $ref references found (transitively). All x-plenum-*
/// extension keys are stripped from the output.
pub(crate) fn build_operation_meta(operation: &Operation, spec: &Spec) -> serde_json::Value {
    let mut result = serde_json::Map::new();

    if let Some(id) = &operation.operation_id {
        result.insert("operationId".into(), serde_json::Value::String(id.clone()));
    }

    if let Some(summary) = &operation.summary {
        result.insert("summary".into(), serde_json::Value::String(summary.clone()));
    }

    // Parameters
    if let Ok(params) = operation.parameters(spec)
        && !params.is_empty()
    {
        let param_values: Vec<serde_json::Value> = params
            .iter()
            .filter_map(|p| serde_json::to_value(p).ok())
            .collect();
        if !param_values.is_empty() {
            result.insert("parameters".into(), serde_json::Value::Array(param_values));
        }
    }

    // requestBody
    if let Ok(Some(req_body)) = operation.request_body(spec)
        && let Ok(val) = serde_json::to_value(&req_body)
    {
        result.insert("requestBody".into(), val);
    }

    // responses
    let responses_map = operation.responses(spec);
    if !responses_map.is_empty() {
        let mut responses_obj = serde_json::Map::new();
        for (status, response) in &responses_map {
            if let Ok(val) = serde_json::to_value(response) {
                responses_obj.insert(status.clone(), val);
            }
        }
        if !responses_obj.is_empty() {
            result.insert("responses".into(), serde_json::Value::Object(responses_obj));
        }
    }

    // Collect all $ref strings from current result and bundle referenced component schemas.
    let partial = serde_json::Value::Object(result.clone());
    let mut visited: HashSet<String> = HashSet::new();
    let mut to_visit: Vec<String> = {
        let mut refs = HashSet::new();
        collect_schema_refs(&partial, &mut refs);
        refs.into_iter().collect()
    };

    let mut bundled_schemas: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();

    while let Some(schema_name) = to_visit.pop() {
        if visited.contains(&schema_name) {
            continue;
        }
        visited.insert(schema_name.clone());

        let schema_value = spec
            .components
            .as_ref()
            .and_then(|c| c.schemas.get(&schema_name))
            .and_then(|s| serde_json::to_value(s).ok());

        if let Some(schema_val) = schema_value {
            // Find any new $refs inside this schema
            let mut new_refs = HashSet::new();
            collect_schema_refs(&schema_val, &mut new_refs);
            for r in new_refs {
                if !visited.contains(&r) {
                    to_visit.push(r);
                }
            }
            bundled_schemas.insert(schema_name, schema_val);
        }
    }

    // Resolve $ref pointers inline using bundled schemas, then drop the components key.
    // Circular refs are left as $ref pointers (AJV handles them natively).
    if !bundled_schemas.is_empty() {
        let mut output_val = serde_json::Value::Object(result);
        let mut has_circular = false;
        resolve_schema_refs(&mut output_val, &bundled_schemas, &mut has_circular);
        result = match output_val {
            serde_json::Value::Object(m) => m,
            _ => unreachable!(),
        };

        // Keep components.schemas only when circular refs remain.
        if has_circular {
            let mut components_obj = serde_json::Map::new();
            components_obj.insert("schemas".into(), serde_json::Value::Object(bundled_schemas));
            result.insert(
                "components".into(),
                serde_json::Value::Object(components_obj),
            );
        }
    }

    // Strip x-plenum-* from the whole result
    let mut output = serde_json::Value::Object(result);
    strip_plenum_extensions(&mut output);
    output
}

/// Walk a JSON value and collect all `#/components/schemas/<name>` $ref targets.
fn collect_schema_refs(value: &serde_json::Value, refs: &mut HashSet<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(ref_str)) = map.get("$ref")
                && let Some(name) = ref_str.strip_prefix("#/components/schemas/")
            {
                refs.insert(name.to_owned());
            }
            for v in map.values() {
                collect_schema_refs(v, refs);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                collect_schema_refs(v, refs);
            }
        }
        _ => {}
    }
}

/// Recursively resolve `#/components/schemas/*` `$ref` pointers by inlining the referenced
/// schema from `schemas`. When a circular reference is detected (a `$ref` that is already
/// being resolved in the current path), the `$ref` is left as-is and `has_circular` is set.
fn resolve_schema_refs(
    value: &mut serde_json::Value,
    schemas: &serde_json::Map<String, serde_json::Value>,
    has_circular: &mut bool,
) {
    resolve_schema_refs_inner(value, schemas, &mut HashSet::new(), has_circular);
}

fn resolve_schema_refs_inner(
    value: &mut serde_json::Value,
    schemas: &serde_json::Map<String, serde_json::Value>,
    resolving: &mut HashSet<String>,
    has_circular: &mut bool,
) {
    match value {
        serde_json::Value::Object(map) => {
            // Check if this object is a $ref.
            if let Some(serde_json::Value::String(ref_str)) = map.get("$ref")
                && let Some(name) = ref_str.strip_prefix("#/components/schemas/")
            {
                let name = name.to_owned();
                if resolving.contains(&name) {
                    // Circular — leave $ref in place.
                    *has_circular = true;
                    return;
                }
                if let Some(schema) = schemas.get(&name) {
                    let mut inlined = schema.clone();
                    resolving.insert(name.clone());
                    resolve_schema_refs_inner(&mut inlined, schemas, resolving, has_circular);
                    resolving.remove(&name);
                    *value = inlined;
                    return;
                }
            }
            // Not a $ref — recurse into values.
            for v in map.values_mut() {
                resolve_schema_refs_inner(v, schemas, resolving, has_circular);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                resolve_schema_refs_inner(v, schemas, resolving, has_circular);
            }
        }
        _ => {}
    }
}

/// Recursively remove object keys starting with `"x-plenum-"` from a JSON value.
fn strip_plenum_extensions(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            map.retain(|k, _| !k.starts_with("x-plenum-"));
            for v in map.values_mut() {
                strip_plenum_extensions(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_plenum_extensions(v);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse_spec(doc: serde_json::Value) -> Spec {
        serde_json::from_value(doc).unwrap()
    }

    fn get_op<'a>(spec: &'a Spec, path: &str, method: &str) -> &'a Operation {
        let path_item = spec.paths.as_ref().unwrap().get(path).unwrap();
        for (m, op) in path_item.methods() {
            if m.as_str().eq_ignore_ascii_case(method) {
                return op;
            }
        }
        panic!("method {} not found at path {}", method, path);
    }

    fn assert_no_plenum_keys(val: &serde_json::Value, path: &str) {
        if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                assert!(
                    !k.starts_with("x-plenum-"),
                    "x-plenum- key '{}' found at {}",
                    k,
                    path
                );
                assert_no_plenum_keys(v, &format!("{}.{}", path, k));
            }
        } else if let Some(arr) = val.as_array() {
            for (i, v) in arr.iter().enumerate() {
                assert_no_plenum_keys(v, &format!("{}[{}]", path, i));
            }
        }
    }

    // --- build_operation_meta ---

    #[test]
    fn operation_meta_basic_fields() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "summary": "List all items",
                        "parameters": [{
                            "name": "limit",
                            "in": "query",
                            "schema": { "type": "integer" }
                        }],
                        "requestBody": {
                            "content": {
                                "application/json": { "schema": { "type": "object" } }
                            }
                        },
                        "responses": { "200": { "description": "ok" } }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        assert_eq!(meta["operationId"].as_str().unwrap(), "listItems");
        assert_eq!(meta["summary"].as_str().unwrap(), "List all items");
        assert!(meta["parameters"].is_array());
        assert_eq!(meta["parameters"].as_array().unwrap().len(), 1);
        assert_eq!(meta["parameters"][0]["name"].as_str().unwrap(), "limit");
        assert!(meta["requestBody"].is_object());
        assert!(meta["responses"].is_object());
        assert!(meta["responses"]["200"].is_object());
    }

    #[test]
    fn operation_meta_ref_resolved_inline() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": { "id": { "type": "string" } }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        let schema = &meta["responses"]["200"]["content"]["application/json"]["schema"];
        // $ref should be resolved inline — no $ref pointer, schema inlined directly.
        assert!(schema.get("$ref").is_none(), "$ref should be resolved");
        assert_eq!(schema["type"].as_str().unwrap(), "object");
        assert_eq!(
            schema["properties"]["id"]["type"].as_str().unwrap(),
            "string"
        );
        // No components key when all refs are resolved.
        assert!(
            meta.get("components").is_none(),
            "components should be absent when all refs are resolved"
        );
    }

    #[test]
    fn operation_meta_transitive_ref_resolved_inline() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": { "bar": { "$ref": "#/components/schemas/Bar" } }
                    },
                    "Bar": {
                        "type": "object",
                        "properties": { "name": { "type": "string" } }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        let schema = &meta["responses"]["200"]["content"]["application/json"]["schema"];
        // Both Foo and Bar should be resolved inline.
        assert_eq!(schema["type"].as_str().unwrap(), "object");
        assert_eq!(
            schema["properties"]["bar"]["type"].as_str().unwrap(),
            "object"
        );
        assert_eq!(
            schema["properties"]["bar"]["properties"]["name"]["type"]
                .as_str()
                .unwrap(),
            "string"
        );
        assert!(
            meta.get("components").is_none(),
            "components should be absent when all refs are resolved"
        );
    }

    #[test]
    fn operation_meta_circular_ref_preserved() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "components": {
                "schemas": {
                    "Foo": {
                        "type": "object",
                        "properties": { "self": { "$ref": "#/components/schemas/Foo" } }
                    }
                }
            },
            "paths": {
                "/items": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Foo" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        let schema = &meta["responses"]["200"]["content"]["application/json"]["schema"];
        // Top-level Foo is inlined, but the self-reference stays as $ref.
        assert_eq!(schema["type"].as_str().unwrap(), "object");
        assert_eq!(
            schema["properties"]["self"]["$ref"].as_str().unwrap(),
            "#/components/schemas/Foo",
            "circular $ref should be preserved"
        );
        // components.schemas should be present for the circular ref.
        assert!(
            meta["components"]["schemas"]["Foo"].is_object(),
            "Foo should be bundled for circular ref resolution"
        );
    }

    #[test]
    fn operation_meta_empty_operation_omits_optional_fields() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "paths": {
                "/items": {
                    "get": {
                        "responses": { "200": { "description": "ok" } }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        assert!(
            meta.get("operationId").is_none(),
            "operationId should be absent when not set"
        );
        assert!(
            meta.get("summary").is_none(),
            "summary should be absent when not set"
        );
        assert!(
            meta.get("parameters").is_none(),
            "parameters should be absent when empty"
        );
        assert!(
            meta.get("requestBody").is_none(),
            "requestBody should be absent when not set"
        );
        assert!(meta["responses"].is_object());
    }

    #[test]
    fn operation_meta_strips_plenum_extensions() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "x-plenum-interceptor": [{
                            "module": "internal:add-header",
                            "hook": "on_request",
                            "function": "onRequest"
                        }],
                        "responses": { "200": { "description": "ok" } }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "get");
        let meta = build_operation_meta(op, &spec);
        assert_no_plenum_keys(&meta, "meta");
        assert_eq!(meta["operationId"].as_str().unwrap(), "listItems");
    }

    #[test]
    fn operation_meta_strips_plenum_extensions_nested() {
        let spec = parse_spec(json!({
            "openapi": "3.1.0",
            "info": { "title": "T", "version": "0" },
            "paths": {
                "/items": {
                    "post": {
                        "operationId": "createItem",
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": { "type": "object" },
                                    "x-plenum-custom": "should-be-stripped"
                                }
                            }
                        },
                        "responses": {
                            "200": {
                                "description": "ok",
                                "x-plenum-custom": "should-be-stripped"
                            }
                        }
                    }
                }
            }
        }));
        let op = get_op(&spec, "/items", "post");
        let meta = build_operation_meta(op, &spec);
        assert_no_plenum_keys(&meta, "meta");
    }
}
