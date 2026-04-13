use std::collections::HashMap;

use deno_core::JsRuntime;
use deno_core::ModuleSpecifier;
use deno_core::PollEventLoopOptions;
use deno_core::RuntimeOptions;
use tokio::sync::{mpsc, oneshot};

use crate::loader::GatewayModuleLoader;
use crate::ops::opengateway_runtime_ext;
use crate::permissions::InterceptorPermissions;
use crate::types::{CallOutput, JsBody, JsCall, JsError, ModuleSource, WorkerReady};

/// Run the JS runtime worker on the current thread. Blocks until the channel is closed.
pub(crate) fn run_worker(
    module_source: ModuleSource,
    permissions: InterceptorPermissions,
    mut rx: mpsc::Receiver<JsCall>,
    ready_tx: oneshot::Sender<Result<WorkerReady, JsError>>,
) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("failed to create tokio runtime for JS worker");

    rt.block_on(async move {
        // Build loader and resolve the specifier to load before creating the runtime.
        let (loader, specifier) = match &module_source {
            ModuleSource::FilePath(path) => {
                let specifier = match ModuleSpecifier::from_file_path(path) {
                    Ok(s) => s,
                    Err(()) => {
                        let err = JsError::ModuleLoadError(format!(
                            "invalid module path: {}",
                            path.display()
                        ));
                        let _ = ready_tx.send(Err(err));
                        return;
                    }
                };
                (GatewayModuleLoader::new(), specifier)
            }
            ModuleSource::Inline { name, source } => {
                let specifier_str = format!("file:///opengateway-internal/{}.js", name);
                let specifier = match ModuleSpecifier::parse(&specifier_str) {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!(
                            "invalid internal module name '{name}': {e}"
                        ))));
                        return;
                    }
                };
                let loader = GatewayModuleLoader::with_embedded(specifier.clone(), source.clone());
                (loader, specifier)
            }
        };

        let ext = opengateway_runtime_ext::init();
        let mut runtime = JsRuntime::new(RuntimeOptions {
            module_loader: Some(std::rc::Rc::new(loader)),
            extensions: vec![ext],
            ..Default::default()
        });
        runtime.op_state().borrow_mut().put(permissions);

        // Load and evaluate the module.
        let module_id = match runtime.load_main_es_module(&specifier).await {
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

        // Retrieve the module's export namespace for function dispatch.
        let module_namespace = match runtime.get_module_namespace(module_id) {
            Ok(ns) => ns,
            Err(e) => {
                let _ = ready_tx.send(Err(JsError::ModuleLoadError(format!(
                    "failed to get module namespace: {e}"
                ))));
                return;
            }
        };

        // Send the isolate handle back so the caller can terminate on timeout.
        let isolate_handle = runtime.v8_isolate().thread_safe_handle();
        let _ = ready_tx.send(Ok(WorkerReady { isolate_handle }));

        let isolate_handle = runtime.v8_isolate().thread_safe_handle();

        // Cache of resolved function references. Avoids re-running namespace lookup on every
        // call for the same function name. The cache is valid for the lifetime of the isolate
        // because interceptor modules set their functions once during module evaluation and
        // never change them. On timeout+recovery, cancel_terminate_execution() restores the
        // isolate without invalidating existing globals, so the cache remains correct.
        let mut fn_cache: HashMap<String, deno_core::v8::Global<deno_core::v8::Function>> =
            HashMap::new();

        // Message loop: receive calls, execute, reply.
        while let Some(call) = rx.recv().await {
            // Always cancel any pending termination before executing.
            // After a timeout, terminate_execution() is called from the caller
            // side, which puts V8 in a terminated state that persists until
            // explicitly cancelled.
            isolate_handle.cancel_terminate_execution();

            let result = execute_call(
                &mut runtime,
                &call.function_name,
                &call.arg,
                call.body,
                &mut fn_cache,
                &module_namespace,
            )
            .await;
            let _ = call.reply.send(result);
        }
    });
}

async fn execute_call(
    runtime: &mut JsRuntime,
    function_name: &str,
    arg: &serde_json::Value,
    body: Option<JsBody>,
    fn_cache: &mut HashMap<String, deno_core::v8::Global<deno_core::v8::Function>>,
    module_namespace: &deno_core::v8::Global<deno_core::v8::Object>,
) -> Result<CallOutput, JsError> {
    use deno_core::v8;

    // Step 1: Resolve the exported function reference, using the cache to avoid
    // repeated namespace lookups. On the first call for a given name we look up
    // the property on the module namespace object (its ES export), store the
    // Global<Function>, and reuse it thereafter.
    let fn_global = if let Some(cached) = fn_cache.get(function_name) {
        cached.clone()
    } else {
        let fn_global = {
            deno_core::scope!(scope, runtime);
            let ns = v8::Local::new(scope, module_namespace);
            let key = v8::String::new(scope, function_name)
                .ok_or_else(|| JsError::FunctionNotFound(function_name.to_string()))?;
            let export_val = ns
                .get(scope, key.into())
                .ok_or_else(|| JsError::FunctionNotFound(function_name.to_string()))?;
            if export_val.is_undefined() || export_val.is_null() {
                return Err(JsError::FunctionNotFound(function_name.to_string()));
            }
            let fn_fn = v8::Local::<v8::Function>::try_from(export_val)
                .map_err(|_| JsError::FunctionNotFound(function_name.to_string()))?;
            v8::Global::new(scope, fn_fn)
        };
        fn_cache.insert(function_name.to_string(), fn_global.clone());
        fn_global
    };

    // Step 2: Build V8 arg object within a scope.
    // The scope borrow on runtime is released when this block ends.
    let arg_global = {
        deno_core::scope!(scope, runtime);

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

        v8::Global::new(scope, v8::Local::<v8::Value>::from(v8_obj))
    };

    // Step 3: Call the JS function and resolve via the event loop.
    // call_with_args returns a future with use<> (no runtime borrow captured),
    // so with_event_loop_promise can drive both concurrently.
    let call_fut = runtime.call_with_args(&fn_global, &[arg_global]);
    let result_global = runtime
        .with_event_loop_promise(call_fut, PollEventLoopOptions::default())
        .await
        .map_err(|e| JsError::ExecutionError(e.to_string()))?;

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
