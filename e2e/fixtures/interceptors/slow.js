export async function onRequest(request) {
    const opts = request.options;
    const delayMs = opts?.delay_ms || 5000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { action: "continue" };
}
