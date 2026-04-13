// Stub for ext:deno_telemetry/util.ts.
// deno_fetch's 26_fetch.js imports span-update helpers from this module.
// These are only called inside TRACING_ENABLED branches, which are disabled
// by the stub_telemetry.js stub, so these exports are never invoked.

function notSupported(name) {
  return function () {
    throw new TypeError(`${name} is not supported in the OpenGateway interceptor runtime`);
  };
}

const updateSpanFromClientResponse = notSupported("updateSpanFromClientResponse");
const updateSpanFromError = notSupported("updateSpanFromError");
const updateSpanFromRequest = notSupported("updateSpanFromRequest");

export {
  updateSpanFromClientResponse,
  updateSpanFromError,
  updateSpanFromRequest,
};
