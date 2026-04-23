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
 *   - `ctx` is a plain user-land object passed into every interceptor and plugin call
 *   - Interceptors/plugins can read and write any key
 *   - Returned `ctx` modifications are shallow-merged before the next invocation
 *   - Gateway metadata (route, method) is available as first-class fields on the input struct
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
// Request-scoped context bag
// ---------------------------------------------------------------------------

/**
 * The request-scoped context bag.
 * User-land code can freely read and write any key.
 * Shallow-merged between interceptor/plugin invocations within a request.
 */
export type Ctx = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Re-export all generated types
// ---------------------------------------------------------------------------

export type {
  PermissionsConfig,
  RequestInput,
  ResponseInput,
  InterceptorOutput,
  PluginRequest,
  PluginInput,
  PluginOutput,
} from "./plenum-generated";

// ---------------------------------------------------------------------------
// Interceptor return type — what JS actually returns (before runtime body extraction)
// ---------------------------------------------------------------------------

/**
 * What a JS interceptor function returns.
 *
 * This differs from `InterceptorOutput` because the JS runtime extracts the
 * `body` field from the return value before Rust deserialises the remainder.
 * As a result, `body` can be any JSON-serialisable value on either variant.
 *
 * `InterceptorOutput` is the Rust deserialisation target (post-extraction);
 * `InterceptorReturn` is the JS-facing contract (pre-extraction).
 */
export type InterceptorReturn =
  | { action: "continue"; status?: number; headers?: Record<string, string | null>; ctx?: Record<string, unknown>; body?: unknown }
  | { action: "respond"; status: number; headers?: Record<string, string>; body?: unknown };
