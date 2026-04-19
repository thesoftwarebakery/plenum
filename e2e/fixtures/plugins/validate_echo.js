exports.init = function init(_options) {
  return {};
};

exports.validate = function validate(config) {
  if (!config || !config.table) {
    throw new Error("validate() failed: missing required field 'table'");
  }
  return {};
};

exports.handle = function handle(input) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true },
  };
};
