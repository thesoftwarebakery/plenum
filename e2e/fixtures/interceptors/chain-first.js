globalThis.addFirst = function(_request) {
  return { action: "continue", headers: { "x-chain-first": "true" } };
};
