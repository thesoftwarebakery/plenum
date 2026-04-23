export function onResponseBody(resp) {
    const newBody = Object.assign({}, resp.body, { intercepted: true });
    return { action: "continue", body: newBody };
}
