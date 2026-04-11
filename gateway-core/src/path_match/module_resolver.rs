use std::path::{Path, PathBuf};

#[derive(Debug)]
pub enum ResolvedModule {
    File(PathBuf),
    Internal { name: String, source: &'static str },
}

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub enum ModuleCacheKey {
    File(PathBuf),
    Internal(String),
}

impl ResolvedModule {
    pub fn cache_key(&self) -> ModuleCacheKey {
        match self {
            ResolvedModule::File(p) => ModuleCacheKey::File(p.clone()),
            ResolvedModule::Internal { name, .. } => ModuleCacheKey::Internal(name.clone()),
        }
    }
}

pub fn resolve_module(
    module_spec: &str,
    config_base: &Path,
) -> Result<ResolvedModule, Box<dyn std::error::Error>> {
    if let Some(name) = module_spec.strip_prefix("internal:") {
        match lookup_builtin(name) {
            Some(source) => Ok(ResolvedModule::Internal {
                name: name.to_string(),
                source,
            }),
            None => Err(format!(
                "unknown built-in interceptor module 'internal:{name}'. Available built-ins: {}",
                available_builtins().join(", ")
            )
            .into()),
        }
    } else {
        let module_path = config_base.join(module_spec);
        let canonical = module_path.canonicalize().map_err(|e| {
            format!(
                "interceptor module '{}' not found (resolved to '{}'): {e}",
                module_spec,
                module_path.display()
            )
        })?;
        Ok(ResolvedModule::File(canonical))
    }
}

fn lookup_builtin(name: &str) -> Option<&'static str> {
    match name {
        "add-header" => Some(include_str!("../../js/add-header.js")),
        _ => None,
    }
}

fn available_builtins() -> Vec<&'static str> {
    vec!["add-header"]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn resolves_internal_add_header() {
        let result = resolve_module("internal:add-header", Path::new("/any/path")).unwrap();
        assert!(matches!(result, ResolvedModule::Internal { name, .. } if name == "add-header"));
    }

    #[test]
    fn rejects_unknown_internal() {
        let err = resolve_module("internal:nonexistent", Path::new("/any/path")).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("unknown built-in interceptor module 'internal:nonexistent'"));
        assert!(msg.contains("add-header"));
    }

    #[test]
    fn resolves_file_path() {
        let tmp = std::env::temp_dir();
        let js_file = tmp.join("test_module.js");
        std::fs::write(&js_file, "globalThis.fn = () => {};").unwrap();
        let result = resolve_module("test_module.js", &tmp).unwrap();
        assert!(matches!(result, ResolvedModule::File(_)));
    }

    #[test]
    fn rejects_missing_file() {
        let err = resolve_module("./nonexistent.js", Path::new("/tmp")).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("not found"));
    }

    #[test]
    fn cache_keys_are_distinct() {
        let mut map: HashMap<ModuleCacheKey, &str> = HashMap::new();
        map.insert(ModuleCacheKey::Internal("add-header".into()), "internal");
        map.insert(ModuleCacheKey::File(PathBuf::from("/some/file.js")), "file");
        assert_eq!(map[&ModuleCacheKey::Internal("add-header".into())], "internal");
        assert_eq!(map[&ModuleCacheKey::File(PathBuf::from("/some/file.js"))], "file");
        // Same name but different key type -- not equal:
        assert_ne!(
            ModuleCacheKey::Internal("add-header".into()),
            ModuleCacheKey::File(PathBuf::from("add-header"))
        );
    }
}
