use std::{collections::BTreeMap, error::Error};

use oas3::Spec;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Upstream {
    pub name: String,
    pub kind: String,
    pub address: String,
    pub port: u16,
}

pub type Upstreams = Option<BTreeMap<String, Upstream>>;

impl Upstream {
    pub fn from_spec(spec: Spec) -> Result<Upstreams, Box<dyn Error>> {
        let mut upstreams = BTreeMap::new();
        for (name, extension) in spec.extensions {
            let upstream_config = serde_json::from_value(extension)?;
            if upstreams.insert(name.clone(), upstream_config).is_some() {
                return Err("duplicate host name".into());
            }
        }
        Ok(Some(upstreams))
    }
}
