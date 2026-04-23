export function init(_options) {
    return {};
}
export function validate(config) {
    if (!config || !config.table) {
        throw new Error("validate() failed: missing required field 'table'");
    }
    return {};
}
export function handle(_input) {
    return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { ok: true },
    };
}
