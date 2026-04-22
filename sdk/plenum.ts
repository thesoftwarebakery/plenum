/**
 * @plenum/types
 *
 * TypeScript types for Plenum interceptors and plugins.
 *
 * Structs are generated from Rust source via typeshare.
 * InterceptorOutput and plugin types are written manually (typeshare does not
 * support internally-tagged serde enums without a `content` key).
 *
 * Pipeline ordering:
 *   on_request → [gateway stages, e.g. rate limiting] → before_upstream → upstream → on_response → on_response_body
 *
 * Context bag:
 *   - `ctx` is passed into every interceptor and plugin call
 *   - `ctx.gateway` is populated by the gateway (read-only for user-land code)
 *   - Interceptors/plugins can read and write any other top-level key
 *   - Returned `ctx` modifications are shallow-merged before the next invocation
 */

// ---------------------------------------------------------------------------
// Primitive alias — serde_json::Value maps to unknown in TypeScript
// ---------------------------------------------------------------------------

/** Any JSON value. */
export type JsonValue = unknown;

// ---------------------------------------------------------------------------
// Gateway-populated ctx sub-object
// ---------------------------------------------------------------------------

/** Gateway-populated fields under `ctx.gateway`. Read-only for user-land code. */
export interface GatewayCtx {
  /** The matched OpenAPI path template, e.g. `/users/{id}`. */
  route: string;
  /** The HTTP method of the request, e.g. `GET`. */
  method: string;
}

// ---------------------------------------------------------------------------
// Request-scoped context bag
// ---------------------------------------------------------------------------

/**
 * The request-scoped context bag.
 * User-land code can read and write any key except `gateway`.
 * `gateway` is always overwritten by the gateway before each call.
 */
export interface Ctx {
  gateway: GatewayCtx;
  [key: string]: JsonValue;
}

// ---------------------------------------------------------------------------
// Interceptor input types (generated from Rust via typeshare)
// ---------------------------------------------------------------------------

/** Sandbox permissions for an interceptor or plugin. */
export interface PermissionsConfig {
  env?: string[];
  read?: string[];
  net?: string[];
}

/** Input passed to on_request and before_upstream interceptors. */
export interface RequestInput {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: string;
  /** Path parameters extracted from the matched route template. */
  params: Record<string, string>;
  /** Curated OpenAPI operation metadata (operationId, parameters, requestBody, responses, components). */
  operation: JsonValue;
  /** The request-scoped context bag. User-land keys plus `ctx.gateway.*` populated by the gateway. */
  ctx: Ctx;
  /** Options passed to this interceptor via `x-plenum-interceptor[*].options`. */
  options?: JsonValue;
}

/** Input passed to on_response and on_response_body interceptors. */
export interface ResponseInput {
  status: number;
  headers: Record<string, string>;
  /** Curated OpenAPI operation metadata. */
  operation: JsonValue;
  /** The request-scoped context bag. User-land keys plus `ctx.gateway.*` populated by the gateway. */
  ctx: Ctx;
  /** Options passed to this interceptor via `x-plenum-interceptor[*].options`. */
  options?: JsonValue;
}

// ---------------------------------------------------------------------------
// Interceptor output type (manually written — typeshare doesn't support
// internally-tagged serde enums without a `content` field)
// ---------------------------------------------------------------------------

/**
 * Returned by an interceptor to continue processing with optional modifications.
 * Headers are merged: new keys added, existing overwritten, `null` removes the header.
 * `ctx` is shallow-merged into the request-scoped ctx bag.
 */
export interface InterceptorContinue {
  action: "continue";
  status?: number;
  headers?: Record<string, string | null>;
  ctx?: Record<string, JsonValue>;
}

/**
 * Returned by an on_request interceptor to short-circuit with an immediate response.
 * Not valid in on_response or on_response_body hooks (ignored with a warning).
 */
export interface InterceptorRespond {
  action: "respond";
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** Output returned by any interceptor. */
export type InterceptorOutput = InterceptorContinue | InterceptorRespond;

// ---------------------------------------------------------------------------
// Plugin types
// ---------------------------------------------------------------------------

/** Input passed to a plugin's `handle()` function. */
export interface PluginInput {
  request: {
    method: string;
    path: string;
    query: string;
    headers: Record<string, string>;
    params: Record<string, string>;
    body?: JsonValue;
  };
  /** The `x-plenum-backend` value for this operation. Opaque to the gateway. */
  config: JsonValue;
  /** Curated OpenAPI operation metadata. */
  operation: JsonValue;
  /** The request-scoped context bag. */
  ctx: Ctx;
}

/** Output returned by a plugin's `handle()` function. */
export interface PluginOutput {
  status?: number;
  headers?: Record<string, string>;
  body?: JsonValue;
  /** Ctx modifications to merge back into the request-scoped ctx bag. */
  ctx?: Record<string, JsonValue>;
}
