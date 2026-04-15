use serde::Deserialize;

/// Per-level validation override. Fields are optional so that
/// only explicitly set values override the inherited defaults.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationOverride {
    pub request: Option<bool>,
    pub response: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn deserializes_full_override() {
        let v: ValidationOverride = serde_json::from_value(json!({
            "request": false,
            "response": true
        }))
        .unwrap();
        assert_eq!(v.request, Some(false));
        assert_eq!(v.response, Some(true));
    }

    #[test]
    fn deserializes_partial_override() {
        let v: ValidationOverride = serde_json::from_value(json!({
            "response": false
        }))
        .unwrap();
        assert_eq!(v.request, None);
        assert_eq!(v.response, Some(false));
    }

    #[test]
    fn deserializes_empty_override() {
        let v: ValidationOverride = serde_json::from_value(json!({})).unwrap();
        assert_eq!(v.request, None);
        assert_eq!(v.response, None);
    }

    #[test]
    fn rejects_unknown_field() {
        let result: Result<ValidationOverride, _> =
            serde_json::from_value(json!({ "request": true, "typo": false }));
        assert!(result.is_err(), "expected error for unknown field typo");
    }
}
