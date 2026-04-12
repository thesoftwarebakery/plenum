export function onRequest(_request) {
  return {
    action: "respond",
    status: 403,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: "blocked by interceptor" }),
  };
}
