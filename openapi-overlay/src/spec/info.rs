use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::spec_extensions;

/// Metadata about the Overlay.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Info {
    /// A human readable description of the purpose of the overlay.
    pub title: String,

    /// A version identifier for indicating changes to the Overlay document.
    pub version: String,

    /// A description of the Overlay document. CommonMark syntax MAY be used for
    /// rich text representation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Specification extensions (x-* fields).
    #[serde(
        flatten,
        with = "spec_extensions",
        skip_serializing_if = "spec_extensions::is_empty"
    )]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn deserialises_required_fields() {
        let json = r#"{"title": "My Overlay", "version": "1.0.0"}"#;
        let info: Info = serde_json::from_str(json).unwrap();
        assert_eq!(info.title, "My Overlay");
        assert_eq!(info.version, "1.0.0");
        assert_eq!(info.description, None);
        assert!(info.extensions.is_empty());
    }

    #[test]
    fn deserialises_all_fields() {
        let json = r#"{"title": "My Overlay", "version": "1.0.0", "description": "A **bold** overlay", "x-custom": true}"#;
        let info: Info = serde_json::from_str(json).unwrap();
        assert_eq!(info.title, "My Overlay");
        assert_eq!(info.version, "1.0.0");
        assert_eq!(info.description.as_deref(), Some("A **bold** overlay"));
        assert_eq!(
            info.extensions.get("custom"),
            Some(&serde_json::json!(true))
        );
    }

    #[test]
    fn rejects_missing_title() {
        let json = r#"{"version": "1.0.0"}"#;
        assert!(serde_json::from_str::<Info>(json).is_err());
    }

    #[test]
    fn rejects_missing_version() {
        let json = r#"{"title": "My Overlay"}"#;
        assert!(serde_json::from_str::<Info>(json).is_err());
    }
}
