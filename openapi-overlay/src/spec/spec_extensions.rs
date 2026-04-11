use std::collections::BTreeMap;
use std::fmt;

use serde::Deserializer;
use serde::de::{MapAccess, Visitor};
use serde::ser::Serializer;

pub(crate) fn deserialize<'de, D>(
    deserializer: D,
) -> Result<BTreeMap<String, serde_json::Value>, D::Error>
where
    D: Deserializer<'de>,
{
    struct ExtensionVisitor;

    impl<'de> Visitor<'de> for ExtensionVisitor {
        type Value = BTreeMap<String, serde_json::Value>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map with optional x- extension fields")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut extensions = BTreeMap::new();
            while let Some((key, value)) = map.next_entry::<String, serde_json::Value>()? {
                if let Some(ext_key) = key.strip_prefix("x-") {
                    extensions.insert(ext_key.to_owned(), value);
                }
            }
            Ok(extensions)
        }
    }

    deserializer.deserialize_map(ExtensionVisitor)
}

pub(crate) fn serialize<S>(
    extensions: &BTreeMap<String, serde_json::Value>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.collect_map(
        extensions
            .iter()
            .map(|(key, value)| (format!("x-{key}"), value)),
    )
}

pub(crate) fn is_empty(extensions: &BTreeMap<String, serde_json::Value>) -> bool {
    extensions.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, serde::Deserialize, serde::Serialize, PartialEq)]
    struct TestStruct {
        name: String,
        #[serde(flatten, with = "super")]
        extensions: BTreeMap<String, serde_json::Value>,
    }

    #[test]
    fn deserialises_extensions() {
        let json = r#"{"name": "test", "x-foo": "bar", "x-num": 42}"#;
        let result: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.name, "test");
        assert_eq!(
            result.extensions.get("foo"),
            Some(&serde_json::Value::String("bar".to_owned()))
        );
        assert_eq!(result.extensions.get("num"), Some(&serde_json::json!(42)));
    }

    #[test]
    fn ignores_non_extension_unknown_fields() {
        let json = r#"{"name": "test", "unknown": true, "x-ext": 1}"#;
        let result: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.extensions.len(), 1);
        assert!(result.extensions.contains_key("ext"));
    }

    #[test]
    fn serialises_with_prefix() {
        let test = TestStruct {
            name: "test".to_owned(),
            extensions: BTreeMap::from([("foo".to_owned(), serde_json::json!("bar"))]),
        };
        let json = serde_json::to_value(&test).unwrap();
        assert_eq!(json["x-foo"], serde_json::json!("bar"));
        assert!(json.get("foo").is_none());
    }
}
