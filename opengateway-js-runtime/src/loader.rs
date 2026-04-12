use deno_core::{
    FsModuleLoader, ModuleLoadOptions, ModuleLoadReferrer, ModuleLoadResponse, ModuleLoader,
    ModuleSource, ModuleSourceCode, ModuleSpecifier, ModuleType, ResolutionKind, resolve_import,
};
use deno_error::JsErrorBox;

/// Module loader for the gateway JS runtime.
///
/// For modules loaded from the filesystem (`ModuleSource::FilePath`), behaves
/// identically to `FsModuleLoader`. For embedded built-in modules
/// (`ModuleSource::Inline`), serves source code from an in-memory map keyed
/// by synthetic `file:///opengateway-internal/<name>.js` specifiers.
pub(crate) struct GatewayModuleLoader {
    embedded: std::collections::HashMap<ModuleSpecifier, String>,
}

impl GatewayModuleLoader {
    /// Loader for file-path modules only (no embedded sources).
    pub fn new() -> Self {
        Self {
            embedded: std::collections::HashMap::new(),
        }
    }

    /// Loader that serves `source` when `specifier` is requested, and
    /// delegates to `FsModuleLoader` for any other specifier.
    pub fn with_embedded(specifier: ModuleSpecifier, source: String) -> Self {
        let mut embedded = std::collections::HashMap::new();
        embedded.insert(specifier, source);
        Self { embedded }
    }
}

impl ModuleLoader for GatewayModuleLoader {
    fn resolve(
        &self,
        specifier: &str,
        referrer: &str,
        _kind: ResolutionKind,
    ) -> Result<ModuleSpecifier, JsErrorBox> {
        resolve_import(specifier, referrer).map_err(JsErrorBox::from_err)
    }

    fn load(
        &self,
        module_specifier: &ModuleSpecifier,
        maybe_referrer: Option<&ModuleLoadReferrer>,
        options: ModuleLoadOptions,
    ) -> ModuleLoadResponse {
        if let Some(source) = self.embedded.get(module_specifier) {
            return ModuleLoadResponse::Sync(Ok(ModuleSource::new(
                ModuleType::JavaScript,
                ModuleSourceCode::String(source.clone().into()),
                module_specifier,
                None,
            )));
        }
        FsModuleLoader.load(module_specifier, maybe_referrer, options)
    }
}
