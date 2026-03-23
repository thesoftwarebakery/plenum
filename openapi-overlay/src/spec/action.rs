use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::spec_extensions;

/// An action to be applied to a target document.
///
/// An action MUST contain exactly one of `update`, `copy`, or `remove`.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Action {
    /// A RFC 9535 JSONPath query expression selecting nodes in the target
    /// document.
    pub target: String,

    /// A description of the action. CommonMark syntax MAY be used for rich text
    /// representation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// A value to merge with the target nodes. The value MUST be compatible with
    /// the target nodes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update: Option<serde_json::Value>,

    /// A JSONPath expression selecting a single node to copy into the target
    /// nodes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy: Option<String>,

    /// When `true`, each target node is removed from its containing map or
    /// array. Defaults to `false`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub remove: bool,

    /// Specification extensions (x-* fields).
    #[serde(flatten, with = "spec_extensions", skip_serializing_if = "spec_extensions::is_empty")]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn deserialises_update_action() {
        let json = r#"{
            "target": "$.paths['/foo'].get.description",
            "update": "This is the new description"
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(action.target, "$.paths['/foo'].get.description");
        assert_eq!(
            action.update,
            Some(serde_json::Value::String(
                "This is the new description".to_owned()
            ))
        );
        assert_eq!(action.copy, None);
        assert!(!action.remove);
    }

    #[test]
    fn deserialises_update_action_with_object_value() {
        let json = r#"{
            "target": "$.paths.*.get",
            "update": {"x-safe": true}
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(action.update, Some(serde_json::json!({"x-safe": true})));
    }

    #[test]
    fn deserialises_remove_action() {
        let json = r#"{
            "target": "$.paths.*.get.parameters[?@.name == 'dummy']",
            "remove": true
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert!(action.remove);
        assert_eq!(action.update, None);
    }

    #[test]
    fn deserialises_copy_action() {
        let json = r#"{
            "target": "$.paths[\"/some-items\"]",
            "copy": "$.paths[\"/items\"]"
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(action.copy.as_deref(), Some("$.paths[\"/items\"]"));
        assert_eq!(action.update, None);
        assert!(!action.remove);
    }

    #[test]
    fn deserialises_action_with_description() {
        let json = r#"{
            "target": "$.info.title",
            "description": "Update the title",
            "update": "New Title"
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(action.description.as_deref(), Some("Update the title"));
    }

    #[test]
    fn deserialises_action_with_extensions() {
        let json = r#"{
            "target": "$.info",
            "update": {},
            "x-reason": "compliance"
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(
            action.extensions.get("reason"),
            Some(&serde_json::json!("compliance"))
        );
    }

    #[test]
    fn rejects_missing_target() {
        let json = r#"{"update": "value"}"#;
        assert!(serde_json::from_str::<Action>(json).is_err());
    }
}
