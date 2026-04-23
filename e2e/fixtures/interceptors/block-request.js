export function onRequest(_request) {
    return {
        action: "respond",
        status: 403,
        headers: { "content-type": "application/json" },
        body: { error: "blocked by interceptor" },
    };
}
