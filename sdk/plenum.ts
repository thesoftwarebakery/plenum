/**
 * @plenum/types
 *
 * TypeScript types for Plenum interceptors and plugins.
 *
 * Core types are generated from Rust structs via ts-rs — see plenum-generated.ts.
 * This file defines the TypeScript-only primitives that the generated types
 * reference, then re-exports everything as the stable public surface.
 *
 * Pipeline ordering:
 *   on_request → [gateway stages, e.g. rate limiting] → before_upstream → upstream → on_response → on_response_body
 *
 * Context bag:
 *   - `ctx` is passed into every interceptor and plugin call
 *   - `ctx.gateway` is populated by the gateway (read-only for user-land code)
 *   - Interceptors/plugins can read and write any other top-level key
 *   - Returned `ctx` modifications are shallow-merged before the next invocation
 *
 * Regenerate plenum-generated.ts:
 *   cargo run -p plenum-core --bin export_types
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
// Re-export generated types (all except PluginInput — extended below)
// ---------------------------------------------------------------------------

export type {
  PermissionsConfig,
  RequestInput,
  ResponseInput,
  InterceptorOutput,
  PluginRequest,
  PluginOutput,
} from "./plenum-generated";

// ---------------------------------------------------------------------------
// Plugin input — generated struct extended with runtime-injected body fields
// ---------------------------------------------------------------------------

import type { PluginInput as _PluginInput } from "./plenum-generated";

/**
 * Input passed to a plugin's `handle()` function.
 *
 * Structured fields (request, config, operation, ctx) come from the Rust
 * PluginInput struct. The JS runtime additionally injects the request body
 * at the top level of the object before calling `handle()`.
 */
export interface PluginInput extends _PluginInput {
  /**
   * The parsed request body. Injected at the top level by the JS runtime.
   * JSON bodies are parsed objects; text bodies are strings;
   * binary bodies are base64 strings (check `bodyEncoding === "base64"`).
   */
  body?: JsonValue;
  /** Present and set to `"base64"` when `body` is a base64-encoded binary. */
  bodyEncoding?: string;
}
