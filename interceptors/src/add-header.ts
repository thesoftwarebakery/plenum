/**
 * add-header interceptor
 *
 * Adds headers to the proxied upstream request. The headers to add are
 * specified in `request.options.headers` (a plain object mapping header
 * names to string values).
 *
 * Interceptor contract:
 *   - `request.options`  -- the `x-opengateway-config` value from the OpenAPI
 *                           operation, parsed as a plain JS object.
 *   - `request.headers`  -- incoming request headers (read-only in this
 *                           interceptor; the returned `headers` object is
 *                           merged into the upstream request instead).
 *   - `request.body`     -- the raw request body string, or null if absent.
 *
 * Return value shape:
 *   { action: "continue", headers?: Record<string, string> }
 *     Continue proxying to the upstream, optionally injecting extra headers.
 *
 *   { action: "respond", status: number, body?: unknown }
 *     Short-circuit the proxy and return a synthetic response to the caller.
 */

/** Options accepted by this interceptor (from x-opengateway-config). */
interface AddHeaderOptions {
  /** Headers to inject into the upstream request, e.g. { "x-source": "gateway" } */
  headers?: Record<string, string>;
}

/** The request object passed to every interceptor by the gateway runtime. */
interface InterceptorRequest {
  options?: AddHeaderOptions;
  headers?: Record<string, string>;
  body?: string | null;
}

/** The result shape expected by the gateway runtime. */
interface ContinueResult {
  action: "continue";
  headers?: Record<string, string>;
}

export function onRequest(request: InterceptorRequest): ContinueResult {
  const headers = (request.options && request.options.headers) || {};
  return { action: "continue", headers };
}
