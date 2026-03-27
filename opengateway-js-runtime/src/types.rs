use std::fmt;
use tokio::sync::oneshot;

/// A call to be dispatched to the JS runtime worker thread.
pub(crate) struct JsCall {
    pub function_name: String,
    pub arg: serde_json::Value,
    pub reply: oneshot::Sender<Result<serde_json::Value, JsError>>,
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
