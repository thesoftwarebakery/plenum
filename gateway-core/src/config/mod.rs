use std::{fs::{canonicalize,read_to_string}};
use oas3::{Spec};
use oapi_overlay::{from_yaml as oapi_overlay_from_yaml, apply_overlay};

#[derive(Debug)]
pub struct Config;

impl Config {
    pub fn parse(path: &str, overlays: &[&str]) -> Spec {
        let yaml = read_to_string(
                canonicalize(path).expect("Cannot resolve OpenAPI schema path")
            )
            .expect("Cannot read config path");
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml).unwrap();

        for overlay in overlays {
            let overlay_doc = oapi_overlay_from_yaml(
                &read_to_string(
                    canonicalize(overlay).expect("Cannot resolve OpenAPI overlay path")
                ).expect("Could not read overlay file")
            ).expect("Failed to parse OpenAPI");
            apply_overlay(&mut doc, &overlay_doc).expect("Cannot apply overlay");
        }
        serde_json::from_value(doc).unwrap()
    }
}
