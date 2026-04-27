use oas3::Spec;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::BTreeMap;
use std::error::Error;
use std::fs::{canonicalize, read_to_string};
use std::path::Path;

#[derive(Debug)]
pub struct Config {
    pub spec: Spec,
    raw_doc: Value,
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

    /// Deserialize a raw extension `Value` with `$ref` resolution.
    /// Use this for operation-level reads where the value is already in hand.
    pub fn resolve<T: DeserializeOwned>(&self, value: &Value) -> Result<T, Box<dyn Error>> {
        if let Ok(ext_ref) = serde_json::from_value::<ExtensionRef>(value.clone()) {
            let resolved = self.follow_ref(&ext_ref.path)?;
            return self.resolve(resolved);
        }
        Ok(serde_json::from_value(value.clone())?)
    }

    fn follow_ref(&self, path: &str) -> Result<&Value, Box<dyn Error>> {
        let pointer = path.trim_start_matches('#');
        self.raw_doc
            .pointer(pointer)
            .ok_or_else(|| format!("$ref '{}' not found", path).into())
    }

    pub fn from_value(doc: serde_json::Value) -> Result<Self, Box<dyn Error>> {
        let spec: Spec = serde_json::from_value(doc.clone())?;
        Ok(Config { spec, raw_doc: doc })
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
        let spec: Spec = serde_json::from_value(doc.clone())?;
        Ok(Config { spec, raw_doc: doc })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_config(doc: Value) -> Config {
        let spec: Spec = serde_json::from_value(doc.clone()).unwrap();
        Config { spec, raw_doc: doc }
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
}
