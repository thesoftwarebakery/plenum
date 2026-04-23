export function init(_options) {
    throw new Error("deliberate init failure for testing");
}
export function handle(_input) {
    return { status: 200, headers: {}, body: null };
}
