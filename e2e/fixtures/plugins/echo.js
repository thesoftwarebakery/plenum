exports.init = function init(options) {
  return {};
};

exports.handle = function handle(input) {
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    body: {
      method: input.request.method,
      path: input.request.path,
      params: input.request.params,
      query: input.request.query,
      headers: input.request.headers,
      config: input.config,
      requestBody: input.body,
      operation: input.operation,
    },
  };
};
