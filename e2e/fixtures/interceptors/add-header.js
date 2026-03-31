globalThis.onRequest = function(_request) {
  return {
    action: "continue",
    headers: { "x-intercepted": "true" },
  };
};
