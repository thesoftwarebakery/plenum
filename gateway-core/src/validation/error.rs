use serde::Serialize;

/// A single validation issue found during schema validation.
#[derive(Debug, Serialize)]
pub struct ValidationIssue {
    pub path: String,
    pub message: String,
}

/// RFC 7807 structured error response for validation failures.
#[derive(Debug, Serialize)]
pub struct ValidationErrorResponse {
    #[serde(rename = "type")]
    pub error_type: &'static str,
    pub title: &'static str,
    pub status: u16,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<ValidationIssue>,
}

impl ValidationErrorResponse {
    pub fn request_error(issues: Vec<ValidationIssue>) -> Self {
        ValidationErrorResponse {
            error_type: "request-validation-error",
            title: "Request Validation Failed",
            status: 400,
            errors: issues,
        }
    }

    pub fn response_error() -> Self {
        ValidationErrorResponse {
            error_type: "response-validation-error",
            title: "Response Validation Failed",
            status: 502,
            errors: Vec::new(),
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            format!(r#"{{"type":"{}","title":"{}","status":{}}}"#, self.error_type, self.title, self.status)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_error_serializes_to_rfc7807() {
        let err = ValidationErrorResponse::request_error(vec![
            ValidationIssue {
                path: "/email".into(),
                message: "not a valid email".into(),
            },
        ]);
        let json: serde_json::Value = serde_json::from_str(&err.to_json()).unwrap();
        assert_eq!(json["type"], "request-validation-error");
        assert_eq!(json["title"], "Request Validation Failed");
        assert_eq!(json["status"], 400);
        assert_eq!(json["errors"][0]["path"], "/email");
    }

    #[test]
    fn response_error_omits_empty_errors_array() {
        let err = ValidationErrorResponse::response_error();
        let json: serde_json::Value = serde_json::from_str(&err.to_json()).unwrap();
        assert_eq!(json["status"], 502);
        assert!(json.get("errors").is_none());
    }
}
