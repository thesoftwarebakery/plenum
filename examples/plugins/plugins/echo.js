/**
 * Echo plugin — returns request details as JSON.
 * Demonstrates plugin init/handle pattern and access to
 * request data, path params, and per-operation config.
 */

exports.init = function init(_options) {
  return {};
};

exports.handle = function handle(input) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: {
      method: input.request.method,
      path: input.request.path,
      params: input.request.params,
      query: input.request.query,
      queryParams: input.request.queryParams,
      config: input.config,
      body: input.body || null,
    },
  };
};
