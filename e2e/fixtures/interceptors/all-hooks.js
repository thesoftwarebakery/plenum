globalThis.onRequest = function (_request) {
  return { action: "continue", headers: { "x-on-request": "fired" } };
};

globalThis.beforeUpstream = function (_request) {
  return { action: "continue", headers: { "x-before-upstream": "fired" } };
};

globalThis.onResponse = function (_response) {
  return { action: "continue", headers: { "x-on-response": "fired" } };
};
