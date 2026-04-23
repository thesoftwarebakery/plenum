export function addFirst(_request) {
    return { action: "continue", headers: { "x-chain-first": "true" } };
}
