export function addSecond(_request) {
  return { action: "continue", headers: { "x-chain-second": "true" } };
}
