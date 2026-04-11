mod error;
mod merge;

pub use error::ApplyError;

use std::collections::HashMap;

use serde_json::Value;
use serde_json_path::JsonPath;

use crate::{Action, Overlay};
use merge::merge_in_place;

/// Apply all actions from an [`Overlay`] to a target document.
pub fn apply_overlay(doc: &mut Value, overlay: &Overlay) -> Result<(), ApplyError> {
    apply_actions(doc, &overlay.actions)
}

/// Apply a slice of [`Action`]s to a target document, sequentially.
pub fn apply_actions(doc: &mut Value, actions: &[Action]) -> Result<(), ApplyError> {
    for action in actions {
        apply_action(doc, action)?;
    }
    Ok(())
}

fn apply_action(doc: &mut Value, action: &Action) -> Result<(), ApplyError> {
    let path =
        action
            .target
            .parse::<JsonPath>()
            .map_err(|source| ApplyError::InvalidTargetPath {
                path: action.target.clone(),
                source,
            })?;

    // Priority: remove > copy > update (matches spec precedence).
    if action.remove {
        apply_remove(doc, &path)?;
    } else if let Some(ref copy_expr) = action.copy {
        apply_copy(doc, &path, copy_expr)?;
    } else if let Some(ref update_val) = action.update {
        apply_update(doc, &path, update_val)?;
    }

    Ok(())
}

fn apply_remove(doc: &mut Value, path: &JsonPath) -> Result<(), ApplyError> {
    let located = path.query_located(doc);
    if located.iter().len() == 0 {
        return Ok(());
    }

    // Collect pointers from node locations.
    let pointers: Vec<String> = located
        .iter()
        .map(|node| node.location().to_json_pointer())
        .collect();

    // Partition into object-key removals and array-index removals.
    // For array indices, group by parent so we can remove highest-first.
    let mut array_removals: HashMap<String, Vec<usize>> = HashMap::new();

    for pointer in &pointers {
        let (parent, last_segment) = split_pointer(pointer);
        if let Ok(index) = last_segment.parse::<usize>() {
            array_removals.entry(parent).or_default().push(index);
        } else {
            // Object key removal.
            if let Some(parent_val) = doc.pointer_mut(&parent)
                && let Some(obj) = parent_val.as_object_mut()
            {
                obj.remove(&last_segment);
            }
        }
    }

    // Remove array elements highest-index-first to avoid invalidation.
    for (parent_ptr, mut indices) in array_removals {
        indices.sort_unstable();
        indices.dedup();
        if let Some(parent_val) = doc.pointer_mut(&parent_ptr)
            && let Some(arr) = parent_val.as_array_mut()
        {
            for &idx in indices.iter().rev() {
                if idx < arr.len() {
                    arr.remove(idx);
                }
            }
        }
    }

    Ok(())
}

fn apply_copy(doc: &mut Value, target_path: &JsonPath, copy_expr: &str) -> Result<(), ApplyError> {
    let copy_path =
        copy_expr
            .parse::<JsonPath>()
            .map_err(|source| ApplyError::InvalidCopyPath {
                path: copy_expr.to_owned(),
                source,
            })?;

    // Query the source — must match exactly one node.
    let source_nodes: Vec<&Value> = copy_path.query(doc).all();
    if source_nodes.len() != 1 {
        return Err(ApplyError::CopySourceNotUnique {
            path: copy_expr.to_owned(),
            count: source_nodes.len(),
        });
    }
    let source_value = source_nodes[0].clone();

    // Collect target pointers.
    let located = target_path.query_located(doc);
    let pointers: Vec<String> = located
        .iter()
        .map(|node| node.location().to_json_pointer())
        .collect();

    if pointers.is_empty() {
        return Ok(());
    }

    // Merge source value into each target.
    for pointer in &pointers {
        if let Some(target) = doc.pointer_mut(pointer) {
            merge_in_place(target, &source_value, pointer)?;
        }
    }

    Ok(())
}

fn apply_update(doc: &mut Value, path: &JsonPath, update: &Value) -> Result<(), ApplyError> {
    let located = path.query_located(doc);
    let pointers: Vec<String> = located
        .iter()
        .map(|node| node.location().to_json_pointer())
        .collect();

    if pointers.is_empty() {
        return Ok(());
    }

    for pointer in &pointers {
        if let Some(target) = doc.pointer_mut(pointer) {
            merge_in_place(target, update, pointer)?;
        }
    }

    Ok(())
}

/// Split a JSON Pointer into (parent_pointer, unescaped_last_segment).
/// e.g. "/foo/bar/2" → ("/foo/bar", "2"), "/paths/~1items" → ("/paths", "/items").
fn split_pointer(pointer: &str) -> (String, String) {
    match pointer.rfind('/') {
        Some(pos) => {
            let parent = if pos == 0 {
                "".to_owned()
            } else {
                pointer[..pos].to_owned()
            };
            let raw_segment = &pointer[pos + 1..];
            // Unescape JSON Pointer: ~1 → /, ~0 → ~
            let segment = raw_segment.replace("~1", "/").replace("~0", "~");
            (parent, segment)
        }
        None => (String::new(), pointer.to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // ── Update tests ──

    #[test]
    fn update_replaces_primitive() {
        let mut doc = json!({"info": {"title": "Old"}});
        let actions = vec![Action {
            target: "$.info.title".to_owned(),
            description: None,
            update: Some(json!("New")),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc["info"]["title"], json!("New"));
    }

    #[test]
    fn update_merges_objects_shallow() {
        let mut doc = json!({"info": {"title": "T", "version": "1.0"}});
        let actions = vec![Action {
            target: "$.info".to_owned(),
            description: None,
            update: Some(json!({"version": "2.0", "description": "Added"})),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc["info"]["title"], json!("T"));
        assert_eq!(doc["info"]["version"], json!("2.0"));
        assert_eq!(doc["info"]["description"], json!("Added"));
    }

    #[test]
    fn update_merges_objects_nested() {
        let mut doc = json!({"a": {"b": {"c": 1, "d": 2}}});
        let actions = vec![Action {
            target: "$.a".to_owned(),
            description: None,
            update: Some(json!({"b": {"c": 99, "e": 3}})),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc, json!({"a": {"b": {"c": 99, "d": 2, "e": 3}}}));
    }

    #[test]
    fn update_concatenates_arrays() {
        let mut doc = json!({"tags": ["a", "b"]});
        let actions = vec![Action {
            target: "$.tags".to_owned(),
            description: None,
            update: Some(json!(["c"])),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc["tags"], json!(["a", "b", "c"]));
    }

    #[test]
    fn update_type_mismatch() {
        let mut doc = json!({"tags": ["a"]});
        let actions = vec![Action {
            target: "$.tags".to_owned(),
            description: None,
            update: Some(json!({"key": "val"})),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        let err = apply_actions(&mut doc, &actions).unwrap_err();
        assert!(matches!(err, ApplyError::TypeMismatch { .. }));
    }

    // ── Remove tests ──

    #[test]
    fn remove_object_key() {
        let mut doc = json!({"info": {"title": "T", "x-internal": true}});
        let actions = vec![Action {
            target: "$['info']['x-internal']".to_owned(),
            description: None,
            update: None,
            copy: None,
            remove: true,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc, json!({"info": {"title": "T"}}));
    }

    #[test]
    fn remove_multiple_array_elements() {
        let mut doc = json!({"items": [0, 1, 2, 3, 4]});
        // Remove indices 1 and 3 via filter.
        let actions = vec![Action {
            target: "$.items[?@ == 1 || @ == 3]".to_owned(),
            description: None,
            update: None,
            copy: None,
            remove: true,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc["items"], json!([0, 2, 4]));
    }

    // ── Copy tests ──

    #[test]
    fn copy_single_source() {
        let mut doc = json!({"paths": {"/items": {"get": {}}, "/new-items": {}}});
        let actions = vec![Action {
            target: r#"$.paths["/new-items"]"#.to_owned(),
            description: None,
            update: None,
            copy: Some(r#"$.paths["/items"]"#.to_owned()),
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc["paths"]["/new-items"], json!({"get": {}}));
    }

    #[test]
    fn copy_zero_source_error() {
        let mut doc = json!({"a": 1});
        let actions = vec![Action {
            target: "$.a".to_owned(),
            description: None,
            update: None,
            copy: Some("$.nonexistent".to_owned()),
            remove: false,
            extensions: Default::default(),
        }];
        let err = apply_actions(&mut doc, &actions).unwrap_err();
        assert!(matches!(
            err,
            ApplyError::CopySourceNotUnique { count: 0, .. }
        ));
    }

    #[test]
    fn copy_multi_source_error() {
        let mut doc = json!({"items": [1, 2], "target": 0});
        let actions = vec![Action {
            target: "$.target".to_owned(),
            description: None,
            update: None,
            copy: Some("$.items[*]".to_owned()),
            remove: false,
            extensions: Default::default(),
        }];
        let err = apply_actions(&mut doc, &actions).unwrap_err();
        assert!(matches!(
            err,
            ApplyError::CopySourceNotUnique { count: 2, .. }
        ));
    }

    // ── No-op test ──

    #[test]
    fn noop_when_target_matches_nothing() {
        let mut doc = json!({"a": 1});
        let original = doc.clone();
        let actions = vec![Action {
            target: "$.nonexistent".to_owned(),
            description: None,
            update: Some(json!("ignored")),
            copy: None,
            remove: false,
            extensions: Default::default(),
        }];
        apply_actions(&mut doc, &actions).unwrap();
        assert_eq!(doc, original);
    }

    // ── Sequential "move" pattern ──

    #[test]
    fn sequential_move_pattern() {
        let mut doc = json!({"paths": {"/items": {"get": {"summary": "List items"}}}});

        let actions = vec![
            // 1. Add a new empty key.
            Action {
                target: "$.paths".to_owned(),
                description: None,
                update: Some(json!({"/new-items": {}})),
                copy: None,
                remove: false,
                extensions: Default::default(),
            },
            // 2. Copy source into it.
            Action {
                target: r#"$.paths["/new-items"]"#.to_owned(),
                description: None,
                update: None,
                copy: Some(r#"$.paths["/items"]"#.to_owned()),
                remove: false,
                extensions: Default::default(),
            },
            // 3. Remove the original.
            Action {
                target: r#"$.paths["/items"]"#.to_owned(),
                description: None,
                update: None,
                copy: None,
                remove: true,
                extensions: Default::default(),
            },
        ];

        apply_actions(&mut doc, &actions).unwrap();

        assert!(doc["paths"].get("/items").is_none());
        assert_eq!(
            doc["paths"]["/new-items"],
            json!({"get": {"summary": "List items"}})
        );
    }

    // ── Integration: apply_overlay ──

    #[test]
    fn apply_overlay_smoke() {
        let overlay: Overlay = serde_json::from_value(json!({
            "overlay": "1.1.0",
            "info": {"title": "Test", "version": "1.0.0"},
            "actions": [
                {"target": "$.info.title", "update": "Updated Title"}
            ]
        }))
        .unwrap();

        let mut doc = json!({"info": {"title": "Original"}});
        apply_overlay(&mut doc, &overlay).unwrap();
        assert_eq!(doc["info"]["title"], json!("Updated Title"));
    }
}
