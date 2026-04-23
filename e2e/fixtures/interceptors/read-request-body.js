export function onRequest(req) {
    const body = req.body;
    if (body && body.flagged === true) {
        const newBody = Object.assign({}, body, { flagChecked: true });
        return { action: "continue", body: newBody };
    }
    return { action: "continue" };
}
