use std::path::{Path, PathBuf};

#[derive(Debug)]
pub enum ResolvedModule {
    File(PathBuf),
    /// Built-in interceptor located in the node-runtime/interceptors/ directory.
    Internal {
        name: String,
        path: PathBuf,
    },
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
            // Use the name for the cache key so all references to `internal:add-header`
            // share a single runtime regardless of path resolution.
            ResolvedModule::Internal { name, .. } => ModuleCacheKey::Internal(name.clone()),
        }
    }
}

pub fn resolve_module(
    module_spec: &str,
    config_base: &Path,
) -> Result<ResolvedModule, Box<dyn std::error::Error>> {
    if let Some(name) = module_spec.strip_prefix("internal:") {
        if !is_known_builtin(name) {
            let all_builtins: Vec<&str> = BUILTIN_INTERCEPTOR_NAMES
                .iter()
                .chain(BUILTIN_PLUGIN_NAMES.iter())
                .copied()
                .collect();
            return Err(format!(
                "unknown built-in module 'internal:{name}'. Available built-ins: {}",
                all_builtins.join(", ")
            )
            .into());
        }
        let path = if BUILTIN_PLUGIN_NAMES.contains(&name) {
            plenum_js_runtime::external::locate_plugin(name)
        } else {
            plenum_js_runtime::external::locate_interceptor(name)
        }
        .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
        Ok(ResolvedModule::Internal {
            name: name.to_string(),
            path,
        })
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

const BUILTIN_INTERCEPTOR_NAMES: &[&str] = &[
    "add-header",
    "validate-request",
    "auth-apikey",
    "validate-response",
    "rate-limit-rejector",
];

const BUILTIN_PLUGIN_NAMES: &[&str] = &["postgres", "mysql", "mongodb"];

fn is_known_builtin(name: &str) -> bool {
    BUILTIN_INTERCEPTOR_NAMES.contains(&name) || BUILTIN_PLUGIN_NAMES.contains(&name)
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
    fn resolves_internal_validate_response() {
        let result = resolve_module("internal:validate-response", Path::new("/any/path")).unwrap();
        assert!(
            matches!(result, ResolvedModule::Internal { name, .. } if name == "validate-response")
        );
    }

    #[test]
    fn rejects_unknown_internal() {
        let err = resolve_module("internal:nonexistent", Path::new("/any/path")).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("unknown built-in module 'internal:nonexistent'"));
        assert!(msg.contains("add-header"));
    }

    #[test]
    fn resolves_internal_postgres() {
        let result = resolve_module("internal:postgres", Path::new("/any/path")).unwrap();
        assert!(matches!(result, ResolvedModule::Internal { ref name, .. } if name == "postgres"));
    }

    #[test]
    fn resolves_internal_mysql() {
        let result = resolve_module("internal:mysql", Path::new("/any/path")).unwrap();
        assert!(matches!(result, ResolvedModule::Internal { ref name, .. } if name == "mysql"));
    }

    #[test]
    fn resolves_internal_mongodb() {
        let result = resolve_module("internal:mongodb", Path::new("/any/path")).unwrap();
        assert!(matches!(result, ResolvedModule::Internal { ref name, .. } if name == "mongodb"));
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
        assert_eq!(
            map[&ModuleCacheKey::Internal("add-header".into())],
            "internal"
        );
        assert_eq!(
            map[&ModuleCacheKey::File(PathBuf::from("/some/file.js"))],
            "file"
        );
        // Same name but different key type -- not equal:
        assert_ne!(
            ModuleCacheKey::Internal("add-header".into()),
            ModuleCacheKey::File(PathBuf::from("add-header"))
        );
    }
}
