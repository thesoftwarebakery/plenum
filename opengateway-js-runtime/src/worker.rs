use deno_core::JsRuntime;
use deno_core::ModuleSpecifier;
use deno_core::PollEventLoopOptions;
use deno_core::RuntimeOptions;
use tokio::sync::{mpsc, oneshot};

use crate::types::{CallOutput, JsBody, JsCall, JsError, ModuleSource, WorkerReady};

/// Run the JS runtime worker on the current thread. Blocks until the channel is closed.
pub(crate) fn run_worker(
    module_source: ModuleSource,
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

        match module_source {
            ModuleSource::FilePath(module_path) => {
                // Load and evaluate the module from the file system.
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
            }
            ModuleSource::Inline { name, source } => {
                // execute_script requires a 'static name; leak the String to satisfy that.
                let static_name: &'static str = Box::leak(name.into_boxed_str());
                if let Err(e) = runtime.execute_script(static_name, source) {
                    let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!("{e}"))));
                    return;
                }
            }
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

            let result =
                execute_call(&mut runtime, &call.function_name, &call.arg, call.body).await;
            let _ = call.reply.send(result);
        }
    });
}

async fn execute_call(
    runtime: &mut JsRuntime,
    function_name: &str,
    arg: &serde_json::Value,
    body: Option<JsBody>,
) -> Result<CallOutput, JsError> {
    use deno_core::v8;

    // Step 1: Look up the function from globalThis, checking it exists.
    let fn_script = format!(
        "if (typeof globalThis.{n} !== \"function\") {{ throw new Error(\"__FUNCTION_NOT_FOUND__:{n}\"); }} globalThis.{n}",
        n = function_name
    );
    let fn_val_global = runtime
        .execute_script("<get-fn>", fn_script)
        .map_err(|e| classify_error(e, function_name))?;

    // Step 2: Build typed function reference and V8 arg object within a scope.
    // The scope borrow on runtime is released when this block ends.
    let (fn_global, arg_global) = {
        deno_core::scope!(scope, runtime);

        // Get a typed v8::Function reference.
        let fn_local = v8::Local::new(scope, fn_val_global);
        let fn_fn = v8::Local::<v8::Function>::try_from(fn_local)
            .map_err(|_| JsError::FunctionNotFound(function_name.to_string()))?;
        let fn_global = v8::Global::new(scope, fn_fn);

        // Serialize JSON metadata (method, path, headers, etc.) to a V8 object.
        let v8_meta = deno_core::serde_v8::to_v8(scope, arg)
            .map_err(|e| JsError::ExecutionError(format!("arg serialization: {e}")))?;
        let v8_obj = v8::Local::<v8::Object>::try_from(v8_meta)
            .map_err(|_| JsError::ExecutionError("arg must be a JSON object".into()))?;

        // Set the `body` property typed to its content-type representation.
        let body_key = v8::String::new(scope, "body").unwrap();
        let body_val: v8::Local<v8::Value> = match body {
            None => v8::null(scope).into(),
            Some(JsBody::Json(v)) => deno_core::serde_v8::to_v8(scope, &v)
                .map_err(|e| JsError::ExecutionError(format!("body JSON serialization: {e}")))?,
            Some(JsBody::Text(s)) => v8::String::new(scope, &s)
                .ok_or_else(|| {
                    JsError::ExecutionError("failed to create V8 string for body".into())
                })?
                .into(),
            Some(JsBody::Bytes(b)) => {
                let to_buf = deno_core::ToJsBuffer::from(b);
                deno_core::serde_v8::to_v8(scope, to_buf).map_err(|e| {
                    JsError::ExecutionError(format!("body buffer serialization: {e}"))
                })?
            }
        };
        v8_obj.set(scope, body_key.into(), body_val);

        let arg_global = v8::Global::new(scope, v8::Local::<v8::Value>::from(v8_obj));
        (fn_global, arg_global)
    };

    // Step 3: Call the JS function and resolve via the event loop.
    // call_with_args returns a future with use<> (no runtime borrow captured),
    // so with_event_loop_promise can drive both concurrently.
    let call_fut = runtime.call_with_args(&fn_global, &[arg_global]);
    let result_global = runtime
        .with_event_loop_promise(call_fut, PollEventLoopOptions::default())
        .await
        .map_err(|e| classify_error(e, function_name))?;

    // Step 4: Extract the result. Body is extracted separately via V8 type inspection
    // so it can be typed correctly (Uint8Array -> Bytes, string -> Text, object -> Json).
    deno_core::scope!(scope, runtime);
    let result_local = v8::Local::new(scope, result_global);

    if result_local.is_null_or_undefined() {
        return Err(JsError::ExecutionError(
            "interceptor returned null or undefined".into(),
        ));
    }

    let obj = v8::Local::<v8::Object>::try_from(result_local)
        .map_err(|_| JsError::ExecutionError("interceptor result must be an object".into()))?;

    // Extract `body` from the result object before JSON deserialization.
    let body_key = v8::String::new(scope, "body").unwrap();
    let has_body = obj.has(scope, body_key.into()).unwrap_or(false);

    let body_out = if has_body {
        let body_val = obj.get(scope, body_key.into()).unwrap();
        if body_val.is_null_or_undefined() {
            // Explicit null/undefined = no body modification
            obj.delete(scope, body_key.into());
            None
        } else if body_val.is_array_buffer_view() {
            // Uint8Array or other typed array: extract raw bytes
            let view = v8::Local::<v8::ArrayBufferView>::try_from(body_val).map_err(|_| {
                JsError::ExecutionError("body ArrayBufferView extraction failed".into())
            })?;
            let mut buf = vec![0u8; view.byte_length()];
            view.copy_contents(&mut buf);
            obj.delete(scope, body_key.into());
            Some(JsBody::Bytes(buf))
        } else if body_val.is_string() {
            let s = body_val.to_rust_string_lossy(scope);
            obj.delete(scope, body_key.into());
            Some(JsBody::Text(s))
        } else {
            // Object, array, etc.: deserialize as a JSON value
            let json_val: serde_json::Value = deno_core::serde_v8::from_v8(scope, body_val)
                .map_err(|e| JsError::ExecutionError(format!("body deserialization: {e}")))?;
            obj.delete(scope, body_key.into());
            Some(JsBody::Json(json_val))
        }
    } else {
        None
    };

    // Deserialize remaining fields (action, status, headers) as serde_json::Value.
    // The body field has been removed from the object above.
    let value: serde_json::Value = deno_core::serde_v8::from_v8(scope, result_local)
        .map_err(|e| JsError::ExecutionError(format!("result deserialization: {e}")))?;

    Ok(CallOutput {
        value,
        body: body_out,
    })
}

fn classify_error(e: impl std::fmt::Display, function_name: &str) -> JsError {
    let msg = e.to_string();
    if msg.contains("__FUNCTION_NOT_FOUND__:") {
        JsError::FunctionNotFound(function_name.to_string())
    } else {
        JsError::ExecutionError(msg)
    }
}
