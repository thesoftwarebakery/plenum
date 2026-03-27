use std::path::PathBuf;

use deno_core::JsRuntime;
use deno_core::ModuleSpecifier;
use deno_core::PollEventLoopOptions;
use deno_core::RuntimeOptions;
use tokio::sync::{mpsc, oneshot};

use crate::types::{JsCall, JsError, WorkerReady};

/// Run the JS runtime worker on the current thread. Blocks until the channel is closed.
pub(crate) fn run_worker(
    module_path: PathBuf,
    mut rx: mpsc::Receiver<JsCall>,
    ready_tx: oneshot::Sender<Result<WorkerReady, JsError>>,
) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("failed to create tokio runtime for JS worker");

    rt.block_on(async move {
        let mut runtime = JsRuntime::new(RuntimeOptions {
            module_loader: Some(std::rc::Rc::new(deno_core::FsModuleLoader)),
            ..Default::default()
        });

        // Load and evaluate the module.
        let module_specifier = match ModuleSpecifier::from_file_path(&module_path) {
            Ok(s) => s,
            Err(()) => {
                let err = JsError::ModuleLoadError(format!(
                    "invalid module path: {}",
                    module_path.display()
                ));
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        let module_id = match runtime.load_main_es_module(&module_specifier).await {
            Ok(id) => id,
            Err(e) => {
                let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!("{e}"))));
                return;
            }
        };

        let eval_future = runtime.mod_evaluate(module_id);
        if let Err(e) = runtime.run_event_loop(Default::default()).await {
            let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!("{e}"))));
            return;
        }
        if let Err(e) = eval_future.await {
            let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!("{e}"))));
            return;
        }

        // Send the isolate handle back so the caller can terminate on timeout.
        let isolate_handle = runtime.v8_isolate().thread_safe_handle();
        let _ = ready_tx.send(Ok(WorkerReady { isolate_handle }));

        let isolate_handle = runtime.v8_isolate().thread_safe_handle();

        // Message loop: receive calls, execute, reply.
        while let Some(call) = rx.recv().await {
            // Always cancel any pending termination before executing.
            // After a timeout, terminate_execution() is called from the caller
            // side, which puts V8 in a terminated state that persists until
            // explicitly cancelled.
            isolate_handle.cancel_terminate_execution();

            let result = execute_call(&mut runtime, &call.function_name, &call.arg).await;
            let _ = call.reply.send(result);
        }
    });
}

async fn execute_call(
    runtime: &mut JsRuntime,
    function_name: &str,
    arg: &serde_json::Value,
) -> Result<serde_json::Value, JsError> {
    let arg_json = serde_json::to_string(arg).unwrap();

    let code = format!(
        r#"
        (async () => {{
            if (typeof globalThis.{fn_name} !== "function") {{
                throw new Error("__FUNCTION_NOT_FOUND__:{fn_name}");
            }}
            const result = await globalThis.{fn_name}({arg});
            return JSON.stringify(result);
        }})()
        "#,
        fn_name = function_name,
        arg = arg_json,
    );

    let global = runtime
        .execute_script("<call>", code)
        .map_err(|e| classify_js_error(e, function_name))?;

    // The script returns a promise — resolve it by running the event loop.
    let resolve_fut = runtime.resolve(global);
    let resolved = runtime
        .with_event_loop_promise(resolve_fut, PollEventLoopOptions::default())
        .await
        .map_err(|e| classify_core_error(e, function_name))?;

    // Extract the JSON string from the resolved value.
    deno_core::scope!(scope, runtime);
    let local = deno_core::v8::Local::new(scope, resolved);
    let result_str = local.to_rust_string_lossy(scope);

    serde_json::from_str(&result_str)
        .map_err(|e| JsError::ExecutionError(format!("invalid JSON result: {e}")))
}

fn classify_js_error(e: Box<deno_core::error::JsError>, function_name: &str) -> JsError {
    let msg = format!("{e}");
    if msg.contains("__FUNCTION_NOT_FOUND__:") {
        JsError::FunctionNotFound(function_name.to_string())
    } else {
        JsError::ExecutionError(msg)
    }
}

fn classify_core_error(e: deno_core::error::CoreError, function_name: &str) -> JsError {
    let msg = format!("{e}");
    if msg.contains("__FUNCTION_NOT_FOUND__:") {
        JsError::FunctionNotFound(function_name.to_string())
    } else {
        JsError::ExecutionError(msg)
    }
}
