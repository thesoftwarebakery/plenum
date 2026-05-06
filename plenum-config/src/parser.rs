use oas3::Spec;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::fs::{canonicalize, read_to_string};
use std::path::{Path, PathBuf};

use crate::interpolation;
use crate::interpolation::FileEntry;

#[derive(Debug)]
pub struct Config {
    pub spec: Spec,
    raw_doc: Value,
    files: HashMap<String, FileEntry>,
}

#[derive(Debug, Deserialize)]
struct ExtensionRef {
    #[serde(rename(deserialize = "$ref"))]
    path: String,
}

impl Config {
    pub fn extension<T: DeserializeOwned>(
        &self,
        extensions: &BTreeMap<String, Value>,
        key: &str,
    ) -> Result<T, Box<dyn Error>> {
        let value = extensions
            .get(key)
            .ok_or_else(|| format!("extension '{}' not found", key))?;
        self.resolve(value)
    }

    /// Try multiple extension levels in order, returning the first match.
    ///
    /// This implements the cascade pattern where operation-level extensions
    /// override path-level, which override root-level. Each level is a
    /// `BTreeMap` of extensions (e.g. `operation.extensions`, `path_item.extensions`,
    /// `spec.extensions`).
    ///
    /// Returns `Ok(None)` if the key is absent at all levels.
    pub fn extension_cascade<T: DeserializeOwned>(
        &self,
        levels: &[&BTreeMap<String, Value>],
        key: &str,
    ) -> Result<Option<T>, Box<dyn Error>> {
        for extensions in levels {
            if let Some(value) = extensions.get(key) {
                return self.resolve(value).map(Some);
            }
        }
        Ok(None)
    }

    /// Deserialize a raw extension `Value` with `$ref` resolution and
    /// boot-time interpolation (`${{ env.* }}`, `${{ file.* }}`).
    /// Use this for operation-level reads where the value is already in hand.
    pub fn resolve<T: DeserializeOwned>(&self, value: &Value) -> Result<T, Box<dyn Error>> {
        let value = if let Ok(ext_ref) = serde_json::from_value::<ExtensionRef>(value.clone()) {
            self.follow_ref(&ext_ref.path)?.clone()
        } else {
            value.clone()
        };
        let interpolated = interpolation::interpolate_value(value, &self.files)
            .map_err(|e| -> Box<dyn Error> { e.into() })?;
        Ok(serde_json::from_value(interpolated)?)
    }

    fn follow_ref(&self, path: &str) -> Result<&Value, Box<dyn Error>> {
        let pointer = path.trim_start_matches('#');
        self.raw_doc
            .pointer(pointer)
            .ok_or_else(|| format!("$ref '{}' not found", path).into())
    }

    pub fn from_value(doc: serde_json::Value) -> Result<Self, Box<dyn Error>> {
        let spec: Spec = serde_json::from_value(doc.clone())?;
        Ok(Config {
            spec,
            raw_doc: doc,
            files: HashMap::new(),
        })
    }

    pub fn parse(
        config_base: &str,
        path: &str,
        overlays: &[String],
    ) -> Result<Self, Box<dyn Error>> {
        let yaml = read_to_string(canonicalize(Path::new(config_base).join(path))?)
            .expect("Cannot read config path");
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml)?;

        for overlay in overlays {
            let overlay_doc = oapi_overlay::from_yaml(&read_to_string(canonicalize(
                Path::new(config_base).join(overlay),
            )?)?)?;
            oapi_overlay::apply_overlay(&mut doc, &overlay_doc)?
        }

        let files = Self::parse_files(&doc, config_base)?;

        let spec: Spec = serde_json::from_value(doc.clone())?;
        Ok(Config {
            spec,
            raw_doc: doc,
            files,
        })
    }

    /// Parse the `x-plenum-files` root extension into a map of key →
    /// [`FileEntry`]. Each entry stores both the resolved absolute path and
    /// the file contents. Relative paths are resolved against `config_base`.
    /// Each file is read eagerly so that missing files are caught at startup.
    fn parse_files(
        doc: &Value,
        config_base: &str,
    ) -> Result<HashMap<String, FileEntry>, Box<dyn Error>> {
        // The oas3 crate strips the `x-` prefix from extension keys, but
        // we're reading from the raw doc here, so use the full key.
        let Some(files_value) = doc.get("x-plenum-files") else {
            return Ok(HashMap::new());
        };

        let entries = files_value
            .as_object()
            .ok_or("x-plenum-files must be an object mapping names to file paths")?;

        let base = Path::new(config_base);
        let mut files = HashMap::with_capacity(entries.len());

        for (key, path_value) in entries {
            let file_path = path_value.as_str().ok_or_else(|| {
                format!("x-plenum-files: value for '{}' must be a string path", key)
            })?;

            let resolved = if Path::new(file_path).is_absolute() {
                PathBuf::from(file_path)
            } else {
                base.join(file_path)
            };

            let contents = std::fs::read_to_string(&resolved).map_err(|e| {
                format!(
                    "x-plenum-files: '{}' -> '{}': {}",
                    key,
                    resolved.display(),
                    e
                )
            })?;

            let abs_path = resolved.to_string_lossy().into_owned();

            files.insert(
                key.clone(),
                FileEntry {
                    path: abs_path,
                    content: contents.trim_end_matches('\n').to_string(),
                },
            );
        }

        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_config(doc: Value) -> Config {
        Config::from_value(doc).unwrap()
    }

    #[derive(Debug, Deserialize, PartialEq)]
    struct TestUpstream {
        address: String,
        port: u16,
    }

    #[test]
    fn extension_resolves_inline_value() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {},
            "x-plenum-upstream": {
                "address": "api.example.com",
                "port": 443
            }
        });
        let config = make_config(doc);

        let upstream: TestUpstream = config
            .extension(&config.spec.extensions, "plenum-upstream")
            .unwrap();

        assert_eq!(
            upstream,
            TestUpstream {
                address: "api.example.com".into(),
                port: 443,
            }
        );
    }

    #[test]
    fn extension_resolves_ref() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {},
            "components": { "x-upstreams": {
                "my-api": {
                    "address": "api.example.com",
                    "port": 8080
                }
            }},
            "x-plenum-upstream": {
                "$ref": "#/components/x-upstreams/my-api"
            }
        });
        let config = make_config(doc);

        let upstream: TestUpstream = config
            .extension(&config.spec.extensions, "plenum-upstream")
            .unwrap();

        assert_eq!(
            upstream,
            TestUpstream {
                address: "api.example.com".into(),
                port: 8080,
            }
        );
    }

    #[test]
    fn extension_returns_error_for_missing_key() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let result = config.extension::<TestUpstream>(&config.spec.extensions, "nonexistent");

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn extension_returns_error_for_broken_ref() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {},
            "x-plenum-upstream": {
                "$ref": "#/components/x-upstreams/does-not-exist"
            }
        });
        let config = make_config(doc);

        let result = config.extension::<TestUpstream>(&config.spec.extensions, "plenum-upstream");

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn resolve_follows_ref_on_raw_value() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {},
            "components": { "x-upstreams": {
                "my-api": {
                    "address": "api.example.com",
                    "port": 8080
                }
            }}
        });
        let config = make_config(doc);

        let ref_value = json!({ "$ref": "#/components/x-upstreams/my-api" });
        let upstream: TestUpstream = config.resolve(&ref_value).unwrap();

        assert_eq!(
            upstream,
            TestUpstream {
                address: "api.example.com".into(),
                port: 8080,
            }
        );
    }

    #[test]
    fn resolve_deserializes_inline_value() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let inline = json!({ "address": "localhost", "port": 3000 });
        let upstream: TestUpstream = config.resolve(&inline).unwrap();

        assert_eq!(
            upstream,
            TestUpstream {
                address: "localhost".into(),
                port: 3000,
            }
        );
    }

    #[test]
    fn resolve_scalar_value() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let val = json!(5000);
        let timeout: u64 = config.resolve(&val).unwrap();
        assert_eq!(timeout, 5000);
    }

    #[test]
    fn resolve_applies_env_interpolation() {
        unsafe { std::env::set_var("PLENUM_TEST_PARSER_ADDR", "10.0.0.1") };
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let val = json!({ "address": "${{ env.PLENUM_TEST_PARSER_ADDR }}", "port": 443 });
        let upstream: TestUpstream = config.resolve(&val).unwrap();
        assert_eq!(upstream.address, "10.0.0.1");
        assert_eq!(upstream.port, 443);
    }

    #[test]
    fn resolve_applies_file_interpolation() {
        let mut config = make_config(json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        }));
        config.files.insert(
            "HOST".to_string(),
            interpolation::FileEntry {
                path: "/etc/hosts/db".to_string(),
                content: "db.internal".to_string(),
            },
        );

        let val = json!({ "address": "${{ file.HOST.content }}", "port": 5432 });
        let upstream: TestUpstream = config.resolve(&val).unwrap();
        assert_eq!(upstream.address, "db.internal");
    }

    #[test]
    fn resolve_errors_on_missing_env_var() {
        unsafe { std::env::remove_var("PLENUM_TEST_PARSER_MISSING") };
        let config = make_config(json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        }));

        let val = json!({ "address": "${{ env.PLENUM_TEST_PARSER_MISSING }}", "port": 80 });
        let result = config.resolve::<TestUpstream>(&val);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("PLENUM_TEST_PARSER_MISSING")
        );
    }

    // ── extension_cascade tests ──────────────────────────────────────────────

    #[test]
    fn cascade_returns_first_match() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let mut root = BTreeMap::new();
        root.insert("plenum-timeout".to_string(), json!(5000));

        let mut path_level = BTreeMap::new();
        path_level.insert("plenum-timeout".to_string(), json!(2000));

        let mut op_level = BTreeMap::new();
        op_level.insert("plenum-timeout".to_string(), json!(1000));

        // Operation wins
        let result: Option<u64> = config
            .extension_cascade(&[&op_level, &path_level, &root], "plenum-timeout")
            .unwrap();
        assert_eq!(result, Some(1000));
    }

    #[test]
    fn cascade_falls_through_to_path() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let mut root = BTreeMap::new();
        root.insert("plenum-timeout".to_string(), json!(5000));

        let mut path_level = BTreeMap::new();
        path_level.insert("plenum-timeout".to_string(), json!(2000));

        let op_level = BTreeMap::new(); // empty

        let result: Option<u64> = config
            .extension_cascade(&[&op_level, &path_level, &root], "plenum-timeout")
            .unwrap();
        assert_eq!(result, Some(2000));
    }

    #[test]
    fn cascade_falls_through_to_root() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let mut root = BTreeMap::new();
        root.insert("plenum-timeout".to_string(), json!(5000));

        let result: Option<u64> = config
            .extension_cascade(
                &[&BTreeMap::new(), &BTreeMap::new(), &root],
                "plenum-timeout",
            )
            .unwrap();
        assert_eq!(result, Some(5000));
    }

    #[test]
    fn cascade_returns_none_when_absent_at_all_levels() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {}
        });
        let config = make_config(doc);

        let result: Option<u64> = config
            .extension_cascade(&[&BTreeMap::new(), &BTreeMap::new()], "plenum-timeout")
            .unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn cascade_resolves_ref() {
        let doc = json!({
            "openapi": "3.1.0",
            "info": { "title": "Test", "version": "1.0" },
            "paths": {},
            "components": { "x-upstreams": {
                "my-api": {
                    "address": "api.example.com",
                    "port": 8080
                }
            }}
        });
        let config = make_config(doc);

        let mut level = BTreeMap::new();
        level.insert(
            "plenum-upstream".to_string(),
            json!({ "$ref": "#/components/x-upstreams/my-api" }),
        );

        let result: Option<TestUpstream> = config
            .extension_cascade(&[&level], "plenum-upstream")
            .unwrap();
        assert_eq!(
            result,
            Some(TestUpstream {
                address: "api.example.com".into(),
                port: 8080,
            })
        );
    }
}
