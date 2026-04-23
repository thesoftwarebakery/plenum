export function readEnv(request) {
    const opts = request.options;
    const envVar = opts?.envVar;
    const value = envVar ? process.env[envVar] : undefined;
    return {
        action: "continue",
        headers: { "x-env-value": value || "not-set" }
    };
}
