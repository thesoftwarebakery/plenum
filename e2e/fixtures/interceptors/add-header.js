exports.onRequest = function onRequest(_request) {
  return {
    action: "continue",
    headers: { "x-intercepted": "true" },
  };
};
