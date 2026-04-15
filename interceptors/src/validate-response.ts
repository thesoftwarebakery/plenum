/**
 * validate-response interceptor
 *
 * Validates the upstream response body against JSON Schemas provided in
 * `request.options.schemas`. Uses AJV for schema validation, which supports
 * the full JSON Schema draft-07 vocabulary.
 *
 * Must be attached to the `on_response_body` hook. Requires the upstream to
 * have `buffer-response: true` for HTTP upstreams (plugin upstreams are always
 * fully buffered).
 *
 * Interceptor contract:
 *   - `request.options.schemas` -- an object mapping status codes (as strings,
 *                                   e.g. "200", "201") to JSON Schema objects.
 *                                   Use the key "default" for a fallback schema
 *                                   that applies when no status-specific schema
 *                                   matches.
 *   - `request.status`          -- the upstream response status code (number).
 *   - `request.body`            -- the response body, parsed for application/json
 *                                   responses. If absent or null, validation is
 *                                   skipped.
 *
 * Return value:
 *   On success:   { action: "continue" }
 *   On failure:   { action: "continue", status: 502, body: <RFC 7807 error> }
 *
 * Note: for HTTP upstreams, `status` in the return value cannot change the
 * HTTP status code already sent to the client -- only the body is replaced.
 * For plugin upstreams the full status + body replacement takes effect.
 */

import Ajv from "ajv";

interface ValidateResponseOptions {
  /** Map of status code strings (or "default") to JSON Schema objects. */
  schemas?: Record<string, object>;
}

interface InterceptorRequest {
  options?: ValidateResponseOptions;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ContinueResult {
  action: "continue";
  status?: number;
  body?: unknown;
}

type InterceptorResult = ContinueResult;

// Instantiate AJV once so the validator is reused across requests.
// strict: false enables compatibility with plain JSON Schema (draft-07).
const ajv = new Ajv({ strict: false });

// Cache compiled validators by schema object identity.
const validatorCache = new WeakMap<object, ReturnType<typeof ajv.compile>>();

function getValidator(schema: object): ReturnType<typeof ajv.compile> {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

export function validateResponse(
  request: InterceptorRequest
): InterceptorResult {
  const schemas = request.options && request.options.schemas;

  // No schemas configured -- nothing to validate.
  if (!schemas) {
    return { action: "continue" };
  }

  // No body to validate -- pass through.
  if (request.body === null || request.body === undefined) {
    return { action: "continue" };
  }

  // Look up the schema for this status code, falling back to "default".
  const statusKey = request.status !== undefined ? String(request.status) : "";
  const schema = schemas[statusKey] ?? schemas["default"];

  if (!schema) {
    // No schema for this status code -- pass through.
    return { action: "continue" };
  }

  // Parse body as JSON if it arrived as a string.
  let parsed: unknown;
  if (typeof request.body === "string") {
    if (request.body === "") {
      return { action: "continue" };
    }
    try {
      parsed = JSON.parse(request.body);
    } catch {
      return {
        action: "continue",
        status: 502,
        body: {
          type: "response-validation-error",
          title: "Response Validation Failed",
          status: 502,
        },
      };
    }
  } else {
    parsed = request.body;
  }

  const validate = getValidator(schema);
  const valid = validate(parsed);

  if (valid) {
    return { action: "continue" };
  }

  return {
    action: "continue",
    status: 502,
    body: {
      type: "response-validation-error",
      title: "Response Validation Failed",
      status: 502,
    },
  };
}
