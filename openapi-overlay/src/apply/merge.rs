use serde_json::Value;

use super::error::ApplyError;

/// Returns a human-readable name for the JSON value kind.
fn value_kind(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Merge `update` into `target` in place, following overlay merge semantics:
///
/// - Primitive + Primitive → replace target with update
/// - Array + Array → concatenate (append update elements)
/// - Object + Object → recursive merge
/// - Mismatched types → error
pub(crate) fn merge_in_place(
    target: &mut Value,
    update: &Value,
    pointer: &str,
) -> Result<(), ApplyError> {
    match (target.is_object(), update.is_object()) {
        (true, true) => {
            let target_obj = target.as_object_mut().expect("guarded by match");
            let update_obj = update.as_object().expect("guarded by match");
            for (key, update_val) in update_obj {
                let child_pointer = format!("{pointer}/{key}");
                if let Some(existing) = target_obj.get_mut(key) {
                    merge_in_place(existing, update_val, &child_pointer)?;
                } else {
                    target_obj.insert(key.clone(), update_val.clone());
                }
            }
            Ok(())
        }
        (false, false) => match (target.is_array(), update.is_array()) {
            (true, true) => {
                let target_arr = target.as_array_mut().expect("guarded by match");
                let update_arr = update.as_array().expect("guarded by match");
                target_arr.extend(update_arr.iter().cloned());
                Ok(())
            }
            (true, false) | (false, true) => Err(ApplyError::TypeMismatch {
                pointer: pointer.to_owned(),
                target_kind: value_kind(target),
                update_kind: value_kind(update),
            }),
            // Both are primitives (null, bool, number, string).
            (false, false) => {
                *target = update.clone();
                Ok(())
            }
        },
        _ => Err(ApplyError::TypeMismatch {
            pointer: pointer.to_owned(),
            target_kind: value_kind(target),
            update_kind: value_kind(update),
        }),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn replaces_primitive_with_primitive() {
        let mut target = json!("old");
        merge_in_place(&mut target, &json!("new"), "").unwrap();
        assert_eq!(target, json!("new"));
    }

    #[test]
    fn concatenates_arrays() {
        let mut target = json!([1, 2]);
        merge_in_place(&mut target, &json!([3, 4]), "").unwrap();
        assert_eq!(target, json!([1, 2, 3, 4]));
    }

    #[test]
    fn merges_objects_recursively() {
        let mut target = json!({"a": 1, "b": {"c": 2, "d": 3}});
        let update = json!({"b": {"c": 99, "e": 5}, "f": 6});
        merge_in_place(&mut target, &update, "").unwrap();
        assert_eq!(
            target,
            json!({"a": 1, "b": {"c": 99, "d": 3, "e": 5}, "f": 6})
        );
    }

    #[test]
    fn type_mismatch_errors() {
        let mut target = json!([1, 2]);
        let err = merge_in_place(&mut target, &json!({"a": 1}), "/foo").unwrap_err();
        match err {
            ApplyError::TypeMismatch {
                pointer,
                target_kind,
                update_kind,
            } => {
                assert_eq!(pointer, "/foo");
                assert_eq!(target_kind, "array");
                assert_eq!(update_kind, "object");
            }
            _ => panic!("expected TypeMismatch"),
        }
    }
}
