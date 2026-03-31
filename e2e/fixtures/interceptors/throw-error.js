globalThis.onRequest = function (_request) {
  throw new Error("boom from on_request");
};

globalThis.beforeUpstream = function (_request) {
  throw new Error("boom from before_upstream");
};

globalThis.onResponse = function (_response) {
  throw new Error("boom from on_response");
};
