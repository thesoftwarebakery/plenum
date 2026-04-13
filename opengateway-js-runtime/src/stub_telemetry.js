// Stub for ext:deno_telemetry/telemetry.ts.
// deno_fetch's 26_fetch.js imports tracing symbols from this module.
// Setting TRACING_ENABLED = false disables all tracing paths in deno_fetch,
// so the remaining exports are never called and can be no-ops.

const TRACING_ENABLED = false;

function notSupported(name) {
  return function () {
    throw new TypeError(`${name} is not supported in the OpenGateway interceptor runtime`);
  };
}

const builtinTracer = notSupported("builtinTracer");
const enterSpan = notSupported("enterSpan");
const restoreSnapshot = notSupported("restoreSnapshot");
const PROPAGATORS = [];

const ContextManager = {
  active: notSupported("ContextManager.active"),
};

export {
  builtinTracer,
  ContextManager,
  enterSpan,
  PROPAGATORS,
  restoreSnapshot,
  TRACING_ENABLED,
};
