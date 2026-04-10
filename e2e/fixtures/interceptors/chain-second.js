globalThis.addSecond = function(_request) {
  return { action: "continue", headers: { "x-chain-second": "true" } };
};
