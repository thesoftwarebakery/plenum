use std::ops::Deref;
use std::time::Duration;

/// A duration type for Plenum configuration that deserializes from
/// human-readable strings like `"500ms"`, `"30s"`, `"5m"`, or `"1h"`.
///
/// Wraps [`std::time::Duration`] and implements [`Deref`] for ergonomic use
/// wherever a `Duration` is expected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfigDuration(Duration);

impl ConfigDuration {
    /// Parse a human-readable duration string.
    ///
    /// Accepted suffixes: `ms` (milliseconds), `s` (seconds), `m` (minutes),
    /// `h` (hours). The numeric part must be a non-negative integer.
    pub fn parse(s: &str) -> Result<Self, String> {
        let s = s.trim();
        // Check `ms` before `m` to avoid ambiguity.
        if let Some(n) = s.strip_suffix("ms") {
            let millis: u64 = n.parse().map_err(|_| format!("invalid duration: '{s}'"))?;
            return Ok(Self(Duration::from_millis(millis)));
        }
        if let Some(n) = s.strip_suffix('s') {
            let secs: u64 = n.parse().map_err(|_| format!("invalid duration: '{s}'"))?;
            return Ok(Self(Duration::from_secs(secs)));
        }
        if let Some(n) = s.strip_suffix('m') {
            let mins: u64 = n.parse().map_err(|_| format!("invalid duration: '{s}'"))?;
            return Ok(Self(Duration::from_secs(mins * 60)));
        }
        if let Some(n) = s.strip_suffix('h') {
            let hours: u64 = n.parse().map_err(|_| format!("invalid duration: '{s}'"))?;
            return Ok(Self(Duration::from_secs(hours * 3600)));
        }
        Err(format!(
            "invalid duration: '{s}' — expected a number followed by ms, s, m, or h \
             (e.g. '500ms', '30s', '5m', '1h')"
        ))
    }

    pub fn from_millis(ms: u64) -> Self {
        Self(Duration::from_millis(ms))
    }

    pub fn from_secs(secs: u64) -> Self {
        Self(Duration::from_secs(secs))
    }

    pub fn as_secs(&self) -> u64 {
        self.0.as_secs()
    }

    pub fn as_millis_u64(&self) -> u64 {
        self.0.as_millis() as u64
    }
}

impl Deref for ConfigDuration {
    type Target = Duration;
    fn deref(&self) -> &Duration {
        &self.0
    }
}

impl std::fmt::Display for ConfigDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let millis = self.0.as_millis();
        if millis == 0 {
            return f.write_str("0s");
        }
        if millis.is_multiple_of(3600 * 1000) {
            write!(f, "{}h", millis / (3600 * 1000))
        } else if millis.is_multiple_of(60 * 1000) {
            write!(f, "{}m", millis / (60 * 1000))
        } else if millis.is_multiple_of(1000) {
            write!(f, "{}s", millis / 1000)
        } else {
            write!(f, "{}ms", millis)
        }
    }
}

impl<'de> serde::Deserialize<'de> for ConfigDuration {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        ConfigDuration::parse(&s).map_err(serde::de::Error::custom)
    }
}

impl serde::Serialize for ConfigDuration {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_milliseconds() {
        assert_eq!(
            *ConfigDuration::parse("500ms").unwrap(),
            Duration::from_millis(500)
        );
        assert_eq!(
            *ConfigDuration::parse("0ms").unwrap(),
            Duration::from_millis(0)
        );
        assert_eq!(
            *ConfigDuration::parse("1ms").unwrap(),
            Duration::from_millis(1)
        );
    }

    #[test]
    fn parse_seconds() {
        assert_eq!(
            *ConfigDuration::parse("30s").unwrap(),
            Duration::from_secs(30)
        );
        assert_eq!(
            *ConfigDuration::parse("1s").unwrap(),
            Duration::from_secs(1)
        );
        assert_eq!(
            *ConfigDuration::parse("0s").unwrap(),
            Duration::from_secs(0)
        );
    }

    #[test]
    fn parse_minutes() {
        assert_eq!(
            *ConfigDuration::parse("5m").unwrap(),
            Duration::from_secs(300)
        );
        assert_eq!(
            *ConfigDuration::parse("1m").unwrap(),
            Duration::from_secs(60)
        );
    }

    #[test]
    fn parse_hours() {
        assert_eq!(
            *ConfigDuration::parse("1h").unwrap(),
            Duration::from_secs(3600)
        );
        assert_eq!(
            *ConfigDuration::parse("2h").unwrap(),
            Duration::from_secs(7200)
        );
    }

    #[test]
    fn parse_trims_whitespace() {
        assert_eq!(
            *ConfigDuration::parse("  30s  ").unwrap(),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn parse_rejects_bare_number() {
        assert!(ConfigDuration::parse("60").is_err());
    }

    #[test]
    fn parse_rejects_empty() {
        assert!(ConfigDuration::parse("").is_err());
    }

    #[test]
    fn parse_rejects_non_numeric() {
        assert!(ConfigDuration::parse("abcms").is_err());
        assert!(ConfigDuration::parse("xs").is_err());
        assert!(ConfigDuration::parse("abc").is_err());
    }

    #[test]
    fn parse_rejects_unknown_suffix() {
        assert!(ConfigDuration::parse("60d").is_err());
    }

    #[test]
    fn display_hours() {
        assert_eq!(ConfigDuration::from_secs(3600).to_string(), "1h");
        assert_eq!(ConfigDuration::from_secs(7200).to_string(), "2h");
    }

    #[test]
    fn display_minutes() {
        assert_eq!(ConfigDuration::from_secs(300).to_string(), "5m");
        assert_eq!(ConfigDuration::from_secs(60).to_string(), "1m");
    }

    #[test]
    fn display_seconds() {
        assert_eq!(ConfigDuration::from_secs(30).to_string(), "30s");
        assert_eq!(ConfigDuration::from_secs(1).to_string(), "1s");
    }

    #[test]
    fn display_milliseconds() {
        assert_eq!(ConfigDuration::from_millis(500).to_string(), "500ms");
        assert_eq!(ConfigDuration::from_millis(1).to_string(), "1ms");
    }

    #[test]
    fn display_zero() {
        assert_eq!(ConfigDuration::from_secs(0).to_string(), "0s");
    }

    #[test]
    fn serde_round_trip() {
        let original = ConfigDuration::from_secs(30);
        let json = serde_json::to_value(&original).unwrap();
        assert_eq!(json, serde_json::json!("30s"));
        let deserialized: ConfigDuration = serde_json::from_value(json).unwrap();
        assert_eq!(original, deserialized);
    }

    #[test]
    fn serde_round_trip_millis() {
        let original = ConfigDuration::from_millis(500);
        let json = serde_json::to_value(&original).unwrap();
        assert_eq!(json, serde_json::json!("500ms"));
        let deserialized: ConfigDuration = serde_json::from_value(json).unwrap();
        assert_eq!(original, deserialized);
    }

    #[test]
    fn deserialize_rejects_number() {
        let result: Result<ConfigDuration, _> = serde_json::from_value(serde_json::json!(5000));
        assert!(result.is_err());
    }

    #[test]
    fn deref_to_duration() {
        let d = ConfigDuration::from_secs(5);
        let std_dur: &Duration = &d;
        assert_eq!(*std_dur, Duration::from_secs(5));
    }

    #[test]
    fn as_secs_accessor() {
        assert_eq!(ConfigDuration::from_secs(42).as_secs(), 42);
        assert_eq!(ConfigDuration::from_millis(1500).as_secs(), 1);
    }
}
