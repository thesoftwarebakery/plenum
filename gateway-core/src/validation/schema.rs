use std::error::Error;

use jsonschema::Validator;
use serde_json::Value;

use super::error::ValidationIssue;

/// A pre-compiled JSON schema validator for use at request time.
pub struct CompiledSchema {
    validator: Validator,
}

impl CompiledSchema {
    /// Compile a JSON schema value into a reusable validator.
    pub fn compile(schema: &Value) -> Result<Self, Box<dyn Error>> {
        let validator = Validator::new(schema)?;
        Ok(CompiledSchema { validator })
    }

    /// Validate a JSON value against this schema.
    /// Returns Ok(()) if valid, or a list of issues if invalid.
    pub fn validate(&self, instance: &Value) -> Result<(), Vec<ValidationIssue>> {
        let errors: Vec<ValidationIssue> = self
            .validator
            .iter_errors(instance)
            .map(|e| ValidationIssue {
                path: e.instance_path().as_str().to_string(),
                message: e.to_string(),
            })
            .collect();

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

impl std::fmt::Debug for CompiledSchema {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CompiledSchema").finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_matching_instance() {
        let schema = json!({
            "type": "object",
            "properties": {
                "name": { "type": "string" }
            },
            "required": ["name"]
        });
        let compiled = CompiledSchema::compile(&schema).unwrap();
        let result = compiled.validate(&json!({"name": "Alice"}));
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_missing_required_field() {
        let schema = json!({
            "type": "object",
            "properties": {
                "name": { "type": "string" }
            },
            "required": ["name"]
        });
        let compiled = CompiledSchema::compile(&schema).unwrap();
        let result = compiled.validate(&json!({}));
        assert!(result.is_err());
        let issues = result.unwrap_err();
        assert!(!issues.is_empty());
    }

    #[test]
    fn rejects_wrong_type() {
        let schema = json!({ "type": "string" });
        let compiled = CompiledSchema::compile(&schema).unwrap();
        let result = compiled.validate(&json!(42));
        assert!(result.is_err());
    }

    #[test]
    fn collects_multiple_errors() {
        let schema = json!({
            "type": "object",
            "properties": {
                "name": { "type": "string" },
                "age": { "type": "integer" }
            },
            "required": ["name", "age"]
        });
        let compiled = CompiledSchema::compile(&schema).unwrap();
        let result = compiled.validate(&json!({}));
        let issues = result.unwrap_err();
        assert!(issues.len() >= 2);
    }
}
