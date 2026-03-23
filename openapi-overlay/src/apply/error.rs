use serde_json_path::ParseError;

/// Errors that can occur when applying overlay actions to a document.
#[derive(Debug, thiserror::Error)]
pub enum ApplyError {
    /// The `target` field of an action is not a valid JSONPath expression.
    #[error("invalid target JSONPath `{path}`: {source}")]
    InvalidTargetPath {
        path: String,
        source: ParseError,
    },

    /// The `copy` field of an action is not a valid JSONPath expression.
    #[error("invalid copy JSONPath `{path}`: {source}")]
    InvalidCopyPath {
        path: String,
        source: ParseError,
    },

    /// A `copy` action's source JSONPath must select exactly one node.
    #[error("copy source `{path}` matched {count} nodes (expected exactly 1)")]
    CopySourceNotUnique {
        path: String,
        count: usize,
    },

    /// An update or copy tried to merge incompatible JSON types.
    #[error("type mismatch at `{pointer}`: cannot merge {update_kind} into {target_kind}")]
    TypeMismatch {
        pointer: String,
        target_kind: &'static str,
        update_kind: &'static str,
    },
}
