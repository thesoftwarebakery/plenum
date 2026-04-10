use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};

use super::spec_extensions;
use super::{Action, Info};

/// An OpenAPI Overlay document (v1.0.0 / v1.1.0).
///
/// An Overlay is an ordered list of [Action]s that are to be applied to a
/// target OpenAPI document.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Overlay {
    /// The version of the Overlay Specification that this document uses.
    pub overlay: String,

    /// Metadata about the Overlay.
    pub info: Info,

    /// A URI reference identifying the target document to apply the overlay to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,

    /// An ordered list of actions to be applied to the target document. The
    /// array MUST contain at least one value.
    #[serde(deserialize_with = "deserialize_actions")]
    pub actions: Vec<Action>,

    /// Specification extensions (x-* fields).
    #[serde(
        flatten,
        with = "spec_extensions",
        skip_serializing_if = "spec_extensions::is_empty"
    )]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

fn deserialize_actions<'de, D>(deserializer: D) -> Result<Vec<Action>, D::Error>
where
    D: Deserializer<'de>,
{
    let actions = Vec::<Action>::deserialize(deserializer)?;
    if actions.is_empty() {
        return Err(serde::de::Error::custom(
            "actions array must contain at least one value",
        ));
    }
    Ok(actions)
}

#[cfg(test)]
mod tests {
    use indoc::indoc;
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn deserialises_minimal_overlay() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"},
            "actions": [
                {"target": "$.info.title", "update": "New Title"}
            ]
        }"#;
        let overlay: Overlay = serde_json::from_str(json).unwrap();
        assert_eq!(overlay.overlay, "1.1.0");
        assert_eq!(overlay.info.title, "Test");
        assert_eq!(overlay.info.version, "1.0.0");
        assert_eq!(overlay.extends, None);
        assert_eq!(overlay.actions.len(), 1);
    }

    #[test]
    fn deserialises_with_extends() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"},
            "extends": "https://example.com/openapi.json",
            "actions": [
                {"target": "$.info.title", "update": "New Title"}
            ]
        }"#;
        let overlay: Overlay = serde_json::from_str(json).unwrap();
        assert_eq!(
            overlay.extends.as_deref(),
            Some("https://example.com/openapi.json")
        );
    }

    #[test]
    fn deserialises_multiple_actions() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Targeted Overlay", "version": "1.0.0"},
            "actions": [
                {"target": "$.paths['/foo'].get.description", "update": "This is the new description"},
                {"target": "$.paths['/bar'].get.description", "update": "This is the updated description"}
            ]
        }"#;
        let overlay: Overlay = serde_json::from_str(json).unwrap();
        assert_eq!(overlay.actions.len(), 2);
        assert_eq!(overlay.actions[0].target, "$.paths['/foo'].get.description");
        assert_eq!(overlay.actions[1].target, "$.paths['/bar'].get.description");
    }

    #[test]
    fn deserialises_with_extensions() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"},
            "actions": [{"target": "$.info", "update": {}}],
            "x-generated-by": "toolname"
        }"#;
        let overlay: Overlay = serde_json::from_str(json).unwrap();
        assert_eq!(
            overlay.extensions.get("generated-by"),
            Some(&serde_json::json!("toolname"))
        );
    }

    #[test]
    fn rejects_missing_overlay_version() {
        let json = r#"{
            "info": {"title": "Test", "version": "1.0.0"},
            "actions": [{"target": "$.info", "update": {}}]
        }"#;
        assert!(serde_json::from_str::<Overlay>(json).is_err());
    }

    #[test]
    fn rejects_missing_info() {
        let json = r#"{
            "overlay": "1.1.0",
            "actions": [{"target": "$.info", "update": {}}]
        }"#;
        assert!(serde_json::from_str::<Overlay>(json).is_err());
    }

    #[test]
    fn rejects_empty_actions() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"},
            "actions": []
        }"#;
        assert!(serde_json::from_str::<Overlay>(json).is_err());
    }

    #[test]
    fn rejects_missing_actions() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"}
        }"#;
        assert!(serde_json::from_str::<Overlay>(json).is_err());
    }

    #[test]
    fn round_trips_through_json() {
        let json = r#"{
            "overlay": "1.1.0",
            "info": {"title": "Round Trip", "version": "2.0.0", "description": "Testing round trip"},
            "extends": "openapi.yaml",
            "actions": [
                {"target": "$.info.title", "update": "Updated"},
                {"target": "$.paths['/old']", "remove": true},
                {"target": "$.paths[\"/new\"]", "copy": "$.paths[\"/old\"]"}
            ]
        }"#;
        let overlay: Overlay = serde_json::from_str(json).unwrap();
        let serialised = serde_json::to_string(&overlay).unwrap();
        let round_tripped: Overlay = serde_json::from_str(&serialised).unwrap();
        assert_eq!(overlay, round_tripped);
    }

    #[cfg(feature = "yaml")]
    #[test]
    fn deserialises_yaml_from_spec_example() {
        let yaml = indoc! {"
            overlay: '1.1.0'
            info:
              title: Targeted Overlay
              version: 1.0.0
            actions:
              - target: $.paths['/foo'].get.description
                update: This is the new description
              - target: $.paths['/bar'].get.description
                update: This is the updated description
        "};
        let overlay: Overlay = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(overlay.overlay, "1.1.0");
        assert_eq!(overlay.info.title, "Targeted Overlay");
        assert_eq!(overlay.actions.len(), 2);
    }

    #[cfg(feature = "yaml")]
    #[test]
    fn deserialises_yaml_with_copy_action() {
        let yaml = indoc! {"
            overlay: '1.1.0'
            info:
              title: Copy contents of an existing path to a new location
              version: 1.0.0
            actions:
              - target: '$.paths[\"/some-items\"]'
                copy: '$.paths[\"/items\"]'
        "};
        let overlay: Overlay = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(
            overlay.actions[0].copy.as_deref(),
            Some("$.paths[\"/items\"]")
        );
    }

    #[cfg(feature = "yaml")]
    #[test]
    fn deserialises_yaml_move_pattern() {
        let yaml = indoc! {"
            overlay: '1.1.0'
            info:
              title: Update the path for an API endpoint
              version: 1.0.0
            actions:
              - target: '$.paths'
                update:
                  /new-items: {}
              - target: '$.paths[\"/new-items\"]'
                copy: '$.paths[\"/items\"]'
              - target: '$.paths[\"/items\"]'
                remove: true
        "};
        let overlay: Overlay = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(overlay.actions.len(), 3);
        assert!(overlay.actions[0].update.is_some());
        assert!(overlay.actions[1].copy.is_some());
        assert!(overlay.actions[2].remove);
    }
}
