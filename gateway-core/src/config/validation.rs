use serde::Deserialize;

/// Per-level validation override. Fields are optional so that
/// only explicitly set values override the inherited defaults.
#[derive(Debug, Clone, Deserialize)]
pub struct ValidationOverride {
    pub request: Option<bool>,
    pub response: Option<bool>,
}

/// Resolved validation config after merging global → path → operation overrides.
#[derive(Debug, Clone)]
pub struct EffectiveValidation {
    pub request: bool,
    pub response: bool,
}

impl Default for EffectiveValidation {
    fn default() -> Self {
        EffectiveValidation {
            request: true,
            response: true,
        }
    }
}

impl EffectiveValidation {
    /// Merge an override on top of the current effective config.
    /// Only explicitly set fields in the override take effect.
    pub fn merge(&mut self, over: &ValidationOverride) {
        if let Some(req) = over.request {
            self.request = req;
        }
        if let Some(resp) = over.response {
            self.response = resp;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn deserializes_full_override() {
        let v: ValidationOverride = serde_json::from_value(json!({
            "request": false,
            "response": true
        }))
        .unwrap();
        assert_eq!(v.request, Some(false));
        assert_eq!(v.response, Some(true));
    }

    #[test]
    fn deserializes_partial_override() {
        let v: ValidationOverride = serde_json::from_value(json!({
            "response": false
        }))
        .unwrap();
        assert_eq!(v.request, None);
        assert_eq!(v.response, Some(false));
    }

    #[test]
    fn deserializes_empty_override() {
        let v: ValidationOverride = serde_json::from_value(json!({})).unwrap();
        assert_eq!(v.request, None);
        assert_eq!(v.response, None);
    }

    #[test]
    fn default_effective_validation_enables_both() {
        let eff = EffectiveValidation::default();
        assert!(eff.request);
        assert!(eff.response);
    }

    #[test]
    fn merge_overrides_set_fields_only() {
        let mut eff = EffectiveValidation::default();
        eff.merge(&ValidationOverride {
            request: Some(false),
            response: None,
        });
        assert!(!eff.request);
        assert!(eff.response); // unchanged
    }

    #[test]
    fn merge_chain_most_specific_wins() {
        let mut eff = EffectiveValidation::default();
        // global: disable response
        eff.merge(&ValidationOverride {
            request: None,
            response: Some(false),
        });
        // path: disable request
        eff.merge(&ValidationOverride {
            request: Some(false),
            response: None,
        });
        // operation: re-enable response
        eff.merge(&ValidationOverride {
            request: None,
            response: Some(true),
        });
        assert!(!eff.request);
        assert!(eff.response);
    }
}
