use std::collections::HashMap;

use pingora_http::{RequestHeader, ResponseHeader};

/// Shared interface for applying header modifications, implemented by both request and
/// response headers. Keeping this private avoids coupling to pingora's header types.
pub(crate) trait HeaderEdit {
    fn set_header(&mut self, name: &str, value: &str);
    fn del_header(&mut self, name: &str);
}

impl HeaderEdit for RequestHeader {
    fn set_header(&mut self, name: &str, value: &str) {
        if let Err(e) = self.insert_header(name.to_string(), value) {
            log::warn!("interceptor: failed to set header {}: {}", name, e);
        }
    }
    fn del_header(&mut self, name: &str) {
        let _ = self.remove_header(name);
    }
}

impl HeaderEdit for ResponseHeader {
    fn set_header(&mut self, name: &str, value: &str) {
        if let Err(e) = self.insert_header(name.to_string(), value) {
            log::warn!("interceptor: failed to set header {}: {}", name, e);
        }
    }
    fn del_header(&mut self, name: &str) {
        let _ = self.remove_header(name);
    }
}

impl HeaderEdit for http::HeaderMap {
    fn set_header(&mut self, name: &str, value: &str) {
        if let (Ok(n), Ok(v)) = (
            http::header::HeaderName::from_bytes(name.as_bytes()),
            http::HeaderValue::from_str(value),
        ) {
            self.insert(n, v);
        } else {
            log::warn!("interceptor: failed to set header {}", name);
        }
    }
    fn del_header(&mut self, name: &str) {
        if let Ok(n) = http::header::HeaderName::from_bytes(name.as_bytes()) {
            self.remove(n);
        }
    }
}

pub(crate) fn apply_header_modifications<H: HeaderEdit>(
    header: &mut H,
    modifications: &HashMap<String, Option<String>>,
) {
    for (name, value) in modifications {
        match value {
            Some(v) => header.set_header(name, v),
            None => header.del_header(name),
        }
    }
}

/// Convert a `HashMap<String, String>` back to an `http::HeaderMap`.
pub(crate) fn headers_hashmap_to_http_headermap(map: &HashMap<String, String>) -> http::HeaderMap {
    let mut header_map = http::HeaderMap::new();
    for (k, v) in map {
        if let (Ok(name), Ok(value)) = (
            http::header::HeaderName::from_bytes(k.as_bytes()),
            http::header::HeaderValue::from_str(v),
        ) {
            header_map.insert(name, value);
        }
    }
    header_map
}
