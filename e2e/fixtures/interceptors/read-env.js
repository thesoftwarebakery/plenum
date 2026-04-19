exports.readEnv = function readEnv(request) {
  var envVar = request.options && request.options.envVar;
  var value = process.env[envVar];
  return {
    action: "continue",
    headers: { "x-env-value": value || "not-set" }
  };
};
