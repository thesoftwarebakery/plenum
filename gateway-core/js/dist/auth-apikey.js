// src/auth-apikey.ts
function timingSafeEqual(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA !== lenB ? 1 : 0;
  const maxLen = Math.max(lenA, lenB);
  for (let i = 0; i < maxLen; i++) {
    mismatch |= a.charCodeAt(i % lenA) ^ b.charCodeAt(i % lenB);
  }
  return mismatch === 0;
}
function checkApiKey(request) {
  const envVar = request.options && request.options.envVar;
  const headerName = request.options && request.options.header;
  if (!envVar || !headerName) {
    return {
      action: "respond",
      status: 500,
      body: { error: "auth-apikey: missing required options (envVar, header)" }
    };
  }
  const denoEnv = globalThis.Deno?.env;
  if (!denoEnv || typeof denoEnv.get !== "function") {
    return {
      action: "respond",
      status: 500,
      body: { error: "auth-apikey: environment variable access is not available" }
    };
  }
  const expectedKey = denoEnv.get(envVar);
  if (!expectedKey) {
    return {
      action: "respond",
      status: 500,
      body: { error: `auth-apikey: expected API key env var '${envVar}' is not set` }
    };
  }
  const actualKey = request.headers && request.headers[headerName];
  if (!actualKey || !timingSafeEqual(actualKey, expectedKey)) {
    return {
      action: "respond",
      status: 401,
      body: { error: "Unauthorized" }
    };
  }
  return { action: "continue" };
}
export {
  checkApiKey
};
