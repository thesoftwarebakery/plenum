/// Trait abstracting access to HTTP request data.
///
/// Implement this for your HTTP library's request type so that
/// [`ExtractionCtx`](crate::ExtractionCtx) can resolve `${{…}}` tokens
/// without depending on a specific HTTP framework.
pub trait RequestData {
    /// Return the value of the request header with the given name, or `None`
    /// if absent. The `name` is already lowercased by the caller.
    fn header(&self, name: &str) -> Option<&str>;

    /// Return the path component of the request URI (e.g. `"/users/42"`).
    fn uri_path(&self) -> &str;

    /// Return the raw query string, if present (e.g. `"key=val&a=1"`).
    fn uri_query(&self) -> Option<&str>;

    /// Return the HTTP method (e.g. `"GET"`, `"POST"`).
    fn method(&self) -> &str;
}

impl<T: RequestData> RequestData for &T {
    fn header(&self, name: &str) -> Option<&str> {
        (**self).header(name)
    }
    fn uri_path(&self) -> &str {
        (**self).uri_path()
    }
    fn uri_query(&self) -> Option<&str> {
        (**self).uri_query()
    }
    fn method(&self) -> &str {
        (**self).method()
    }
}
