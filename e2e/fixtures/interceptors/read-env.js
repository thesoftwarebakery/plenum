globalThis.readEnv = function(request) {
  var envVar = request.options && request.options.envVar;
  try {
    var value = Deno.env.get(envVar);
    return {
      action: "continue",
      headers: { "x-env-value": value || "not-set" }
    };
  } catch (e) {
    // Permission denied -- return a header indicating the error
    return {
      action: "respond",
      status: 403,
      body: { error: e.message }
    };
  }
};
