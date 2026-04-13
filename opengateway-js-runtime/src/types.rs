use std::fmt;
use tokio::sync::oneshot;

/// Source of a JS module to load into the runtime.
pub(crate) enum ModuleSource {
    /// Load from a file on disk.
    FilePath(std::path::PathBuf),
    /// Inline source code with a logical name.
    ///
    /// The source is loaded as an ES module. Functions must be exported using
    /// `export function <name>(...)` syntax.
    Inline { name: String, source: String },
}

/// Body content passed to or returned from a JS interceptor, typed by content-type.
#[derive(Debug)]
pub enum JsBody {
    /// Parsed JSON body (`application/json`). Passed as a JS object.
    Json(serde_json::Value),
    /// Text body (`text/*`, `application/xml`, etc.). Passed as a JS string.
    Text(String),
    /// Binary body (everything else). Passed as a JS `Uint8Array`.
    Bytes(Vec<u8>),
}

/// Output from a JS interceptor call. The main result value excludes the body
/// field, which is extracted separately due to its typed nature.
#[derive(Debug)]
pub struct CallOutput {
    /// The interceptor return value without the `body` field
    /// (contains `action`, `status`, `headers`, etc.).
    pub value: serde_json::Value,
    /// The interceptor's returned body, if any.
    pub body: Option<JsBody>,
}

/// A call to be dispatched to the JS runtime worker thread.
pub(crate) struct JsCall {
    pub function_name: String,
    pub arg: serde_json::Value,
    pub body: Option<JsBody>,
    pub reply: oneshot::Sender<Result<CallOutput, JsError>>,
}

/// Errors that can occur when calling into the JS runtime.
#[derive(Debug)]
pub enum JsError {
    /// The JS execution exceeded the timeout.
    Timeout,
    /// A JS exception was thrown during execution.
    ExecutionError(String),
    /// The module could not be loaded.
    ModuleLoadError(String),
    /// The exported function was not found in the module.
    FunctionNotFound(String),
}

impl fmt::Display for JsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            JsError::Timeout => write!(f, "JS execution timed out"),
            JsError::ExecutionError(msg) => write!(f, "JS execution error: {msg}"),
            JsError::ModuleLoadError(msg) => write!(f, "module load error: {msg}"),
            JsError::FunctionNotFound(name) => {
                write!(f, "function '{name}' not found in module exports")
            }
        }
    }
}

impl std::error::Error for JsError {}

/// Result sent from the worker thread after spawning, containing the isolate handle.
pub(crate) struct WorkerReady {
    pub isolate_handle: deno_core::v8::IsolateHandle,
}
