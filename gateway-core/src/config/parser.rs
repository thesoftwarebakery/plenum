use log::warn;
use serde::Deserialize;
use serde_json::Value;
use super::upstreams::*;
use oas3::Spec;
use oas3::spec::{Operation, PathItem};
use std::collections::BTreeMap;
use std::error::Error;
use std::fs::{read_to_string,canonicalize};
use std::path::Path;
use http::Method;

#[derive(Debug)]
pub struct Config {
    pub raw_spec: Spec,
    pub upstreams: Upstreams,
    pub paths: PathConfig,
}

type PathsConfig = BTreeMap<String, PathConfig>;
type PathConfig = BTreeMap<Method, Option<PathMethodConfig>>;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum UpstreamConfigOrReference {
    Reference(String),
    Inline(Upstream),
}

#[derive(Debug)]
struct PathMethodConfig {
    oas_path_item: PathItem,
    upstream: Upstream,
}

impl Config {
    fn resolve_upstream(spec: &Spec, path_item: &PathItem, operation: &Operation) -> Result<Upstream, Box<dyn Error>> {
        let operation_upstream = match operation.extensions.get("opengateway-upstream") {
            Some(upstream) => {
                let upstream_value: UpstreamConfigOrReference = serde_json::from_value(upstream.clone())?;
                match upstream_value {
                    UpstreamConfigOrReference::Inline(upstream_value) => {
                        upstream_value
                    },
                    UpstreamConfigOrReference::Reference(name) => {
                        let upstream: Upstream = serde_json::from_value(path_item.extensions.get(&name).unwrap().clone()).unwrap();
                        upstream
                    }
                }
            },
            None => {

            }
        }
    }

    fn get_paths_config(spec: &Spec) -> Result<PathsConfig, Box<dyn std::error::Error>> {
        let path_method_config: PathsConfig = match spec.paths {
            Some(paths) => {
                paths.into_iter()
                    .map(|(path, path_item)| {
                          let methods: BTreeMap<String, PathMethodConfig> = [
                              ("get", &path_item.get),
                              ("post", &path_item.post),
                              ("put", &path_item.put),
                              ("delete", &path_item.delete),
                              ("patch", &path_item.patch),
                              ("head", &path_item.head),
                              ("options", &path_item.options),
                          ]
                          .into_iter()
                          .filter_map(|(method, op)| {
                              (op.as_ref().map(|operation| {
                                  (method.to_string(), PathMethodConfig {
                                      oas_path_item: path_item,
                                      upstream: Config::resolve_upstream(spec, &path_item, operation).unwrap()
                                  })
                              }))
                          })
                          .collect();
                    }).collect()
            },
            None => {
                return Err("No paths in spec".into())
            }
        };
        Ok(path_method_config)
    }

    pub fn parse(config_base: &str, path: &str, overlays: &[String]) -> Result<Self, Box<dyn Error>> {
        let yaml = read_to_string(
                canonicalize(Path::new(config_base).join(path))?
            )
            .expect("Cannot read config path");
        let mut doc: serde_json::Value = serde_yaml_ng::from_str(&yaml)?;

        for overlay in overlays {
            let overlay_doc = oapi_overlay::from_yaml(
                &read_to_string(
                    canonicalize(Path::new(config_base).join(overlay))?
                )?
            )?;
            oapi_overlay::apply_overlay(&mut doc, &overlay_doc)?
        }
        let spec: Spec = serde_json::from_value(doc)?;
        let upstreams = Upstream::from_spec(&spec);
        Ok(Config { raw_spec: spec, upstreams })
    }
}
