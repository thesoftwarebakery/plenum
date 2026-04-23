export function onRequest(req) {
    const newBody = Object.assign({}, req.body, { intercepted: true });
    return { action: "continue", body: newBody };
}
