export async function onRequest(req) {
    const opts = req.options;
    const resp = await fetch(`http://${opts.externalHost}/token`);
    const body = await resp.json();
    return {
        action: "continue",
        headers: {
            ...req.headers,
            "x-token": body.token,
        },
    };
}
