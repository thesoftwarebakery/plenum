globalThis.onRequest = function(request) {
  var headers = (request.options && request.options.headers) || {};
  return { action: "continue", headers: headers };
};
