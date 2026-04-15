use std::collections::{HashMap, HashSet};

use oas3::spec::{Operation, Spec};

use crate::validation::schema::CompiledSchema;

/// Try to compile the JSON schema from an operation's request body (application/json only).
pub(crate) fn compile_request_body_schema(
    operation: &Operation,
    spec: &Spec,
) -> Option<CompiledSchema> {
    let req_body = operation.request_body(spec).ok()??;
    let media_type = req_body.content.get("application/json")?;
    let schema = media_type.schema(spec).ok()??;
    let value = serde_json::to_value(&schema).ok()?;
    CompiledSchema::compile(&value).ok()
}

/// Compile JSON schemas from an operation's responses, keyed by status code.
pub(crate) fn compile_response_schemas(
    operation: &Operation,
    spec: &Spec,
) -> (HashMap<u16, CompiledSchema>, Option<CompiledSchema>) {
    let mut responses = HashMap::new();
    let mut default_response = None;

    for (status_key, response) in operation.responses(spec) {
        let Some(media_type) = response.content.get("application/json") else {
            continue;
        };
        let Some(schema) = media_type.schema(spec).ok().flatten() else {
            continue;
        };
        let Some(value) = serde_json::to_value(&schema).ok() else {
            continue;
        };
        let Some(compiled) = CompiledSchema::compile(&value).ok() else {
            continue;
        };

        if status_key == "default" {
            default_response = Some(compiled);
        } else if let Ok(code) = status_key.parse::<u16>() {
            responses.insert(code, compiled);
        }
    }

    (responses, default_response)
}

/// Build a curated OpenAPI Operation Object JSON value for runtime use.
///
/// Includes operationId, summary, parameters, requestBody, responses, and bundled
/// component schemas for any $ref references found (transitively). All x-opengateway-*
/// extension keys are stripped from the output.
pub(crate) fn build_operation_meta(operation: &Operation, spec: &Spec) -> serde_json::Value {
    let mut result = serde_json::Map::new();

    if let Some(id) = &operation.operation_id {
        result.insert(
            "operationId".to_owned(),
            serde_json::Value::String(id.clone()),
        );
    }

    if let Some(summary) = &operation.summary {
        result.insert(
            "summary".to_owned(),
            serde_json::Value::String(summary.clone()),
        );
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
            result.insert(
                "parameters".to_owned(),
                serde_json::Value::Array(param_values),
            );
        }
    }

    // requestBody
    if let Ok(Some(req_body)) = operation.request_body(spec)
        && let Ok(val) = serde_json::to_value(&req_body)
    {
        result.insert("requestBody".to_owned(), val);
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
            result.insert(
                "responses".to_owned(),
                serde_json::Value::Object(responses_obj),
            );
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

    if !bundled_schemas.is_empty() {
        let mut components_obj = serde_json::Map::new();
        components_obj.insert(
            "schemas".to_owned(),
            serde_json::Value::Object(bundled_schemas),
        );
        result.insert(
            "components".to_owned(),
            serde_json::Value::Object(components_obj),
        );
    }

    // Strip x-opengateway-* from the whole result
    let mut output = serde_json::Value::Object(result);
    strip_opengateway_extensions(&mut output);
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

/// Recursively remove object keys starting with `"x-opengateway-"` from a JSON value.
fn strip_opengateway_extensions(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            map.retain(|k, _| !k.starts_with("x-opengateway-"));
            for v in map.values_mut() {
                strip_opengateway_extensions(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_opengateway_extensions(v);
            }
        }
        _ => {}
    }
}
