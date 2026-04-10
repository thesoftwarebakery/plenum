pub mod apply;
pub mod spec;

pub use apply::{ApplyError, apply_actions, apply_overlay};
pub use spec::{Action, Info, Overlay};

/// Deserialise an [`Overlay`] from a JSON string.
pub fn from_json(json: &str) -> Result<Overlay, serde_json::Error> {
    serde_json::from_str(json)
}

/// Deserialise an [`Overlay`] from a JSON byte slice.
pub fn from_json_slice(bytes: &[u8]) -> Result<Overlay, serde_json::Error> {
    serde_json::from_slice(bytes)
}

/// Serialise an [`Overlay`] to a JSON string.
pub fn to_json(overlay: &Overlay) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(overlay)
}

/// Deserialise an [`Overlay`] from a YAML string.
#[cfg(feature = "yaml")]
pub fn from_yaml(yaml: &str) -> Result<Overlay, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

/// Serialise an [`Overlay`] to a YAML string.
#[cfg(feature = "yaml")]
pub fn to_yaml(overlay: &Overlay) -> Result<String, serde_yaml::Error> {
    serde_yaml::to_string(overlay)
}
