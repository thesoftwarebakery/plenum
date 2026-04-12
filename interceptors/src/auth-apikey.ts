/**
 * auth-apikey interceptor
 *
 * Validates an API key passed in a request header. The expected key is read
 * from an environment variable whose name is provided in the interceptor
 * options, allowing secrets to stay out of the OpenAPI spec.
 *
 * NOTE: Environment variable access requires Phase 3 (Deno.env permission
 * op). Until that is implemented, `Deno.env.get` is not available in the
 * runtime sandbox. The interceptor handles this gracefully by returning a
 * 500 error when the env access is unavailable, rather than crashing.
 *
 * Interceptor contract:
 *   - `request.options.envVar`  -- name of the env var holding the expected
 *                                  API key, e.g. "API_KEY".
 *   - `request.options.header`  -- name of the request header carrying the
 *                                  actual key, e.g. "x-api-key".
 *   - `request.headers`         -- incoming request headers (lower-cased).
 *
 * Return value:
 *   Key correct:     { action: "continue" }
 *   Key wrong/missing: { action: "respond", status: 401, body: { error } }
 *   Env not configured: { action: "respond", status: 500, body: { error } }
 */

/** Options accepted by this interceptor (from x-opengateway-config). */
interface AuthApiKeyOptions {
  /** Environment variable name that holds the expected API key. */
  envVar: string;
  /** Header name that the caller sends the API key in. */
  header: string;
}

/** The request object passed to every interceptor by the gateway runtime. */
interface InterceptorRequest {
  options?: AuthApiKeyOptions;
  headers?: Record<string, string>;
  body?: string | null;
}

/** Pass the request through to the upstream. */
interface ContinueResult {
  action: "continue";
}

/** Return a synthetic response to the caller without proxying. */
interface RespondResult {
  action: "respond";
  status: number;
  body: { error: string };
}

type InterceptorResult = ContinueResult | RespondResult;

/**
 * Constant-time string comparison to prevent timing side channels.
 * Iterates all characters even on early mismatch so response latency does
 * not reveal how many leading characters were correct.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA !== lenB ? 1 : 0;
  const maxLen = Math.max(lenA, lenB);
  for (let i = 0; i < maxLen; i++) {
    mismatch |= a.charCodeAt(i % lenA) ^ b.charCodeAt(i % lenB);
  }
  return mismatch === 0;
}

export function checkApiKey(
  request: InterceptorRequest
): InterceptorResult {
  const envVar = request.options && request.options.envVar;
  const headerName = request.options && request.options.header;

  if (!envVar || !headerName) {
    return {
      action: "respond",
      status: 500,
      body: { error: "auth-apikey: missing required options (envVar, header)" },
    };
  }

  // Deno.env.get is injected by the gateway runtime (Phase 3). If it is not
  // yet available, fail closed with a 500 rather than allowing unauthenticated
  // access.
  const denoEnv = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno?.env;
  if (!denoEnv || typeof denoEnv.get !== "function") {
    return {
      action: "respond",
      status: 500,
      body: { error: "auth-apikey: environment variable access is not available" },
    };
  }

  const expectedKey = denoEnv.get(envVar);

  // If the env var is not set, the gateway is misconfigured -- fail with 500.
  if (!expectedKey) {
    return {
      action: "respond",
      status: 500,
      body: { error: `auth-apikey: expected API key env var '${envVar}' is not set` },
    };
  }

  const actualKey = request.headers && request.headers[headerName];

  // Missing or incorrect key -- reject with 401.
  // Use a constant-time comparison to avoid timing side channels that could
  // allow an attacker to enumerate valid key prefixes via response latency.
  if (!actualKey || !timingSafeEqual(actualKey, expectedKey)) {
    return {
      action: "respond",
      status: 401,
      body: { error: "Unauthorized" },
    };
  }

  return { action: "continue" };
}
