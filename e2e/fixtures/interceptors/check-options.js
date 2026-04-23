export function checkOptions(input) {
    const opts = input.options;
    const expectedHeader = opts?.expectedHeader ?? '';
    const expectedValue = opts?.expectedValue;
    const denyStatus = opts?.denyStatus;
    let headerVal = input.headers[expectedHeader] || input.headers[expectedHeader.toLowerCase()] || input.headers[expectedHeader.toUpperCase()];
    // Try to find header case-insensitively
    if (!headerVal) {
        const keys = Object.keys(input.headers);
        for (const k of keys) {
            if (k.toLowerCase() === expectedHeader.toLowerCase()) {
                headerVal = input.headers[k];
                break;
            }
        }
    }
    if (headerVal === expectedValue) {
        return { action: "continue", headers: { "x-options-verified": "true" } };
    }
    return { action: "respond", status: denyStatus || 403, body: { error: "options check failed" } };
}
