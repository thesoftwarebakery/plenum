globalThis.onRequest = function (_request) {
  return { wrong: "shape" };
};

globalThis.beforeUpstream = function (_request) {
  return { wrong: "shape" };
};

globalThis.onResponse = function (_response) {
  return { wrong: "shape" };
};
