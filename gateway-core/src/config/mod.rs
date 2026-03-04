use std::{error::Error, fs::{canonicalize,read_to_string}, path::Path};
use oas3::{Spec};
use oapi_overlay::{from_yaml as oapi_overlay_from_yaml, apply_overlay};

#[derive(Debug)]
pub struct Config;

impl Config {
    pub fn parse(config_base: &str, path: &str, overlays: &[String]) -> Result<Spec, Box<dyn Error>> {
        let yaml = read_to_string(
                canonicalize(Path::new(config_base).join(path))?
            )
            .expect("Cannot read config path");
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml)?;

        for overlay in overlays {
            let overlay_doc = oapi_overlay_from_yaml(
                &read_to_string(
                    canonicalize(Path::new(config_base).join(overlay))?
                )?
            )?;
            apply_overlay(&mut doc, &overlay_doc)?
        }
        Ok(serde_json::from_value(doc)?)
    }
}
