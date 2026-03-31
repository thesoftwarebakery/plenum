globalThis.onRequest = function (_request) {
  fetch("http://example.com");
  return { action: "continue" };
};
