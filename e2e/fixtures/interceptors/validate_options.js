exports.validate = function validate(config) {
  if (!config.options || !config.options.required_key) {
    throw new Error("validate() failed: missing required_key in options");
  }
  return {};
};

exports.onRequest = function onRequest(_input) {
  return { action: "continue" };
};
