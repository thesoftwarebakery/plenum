/**
 * validate-request interceptor
 *
 * Validates the incoming request body against a JSON Schema provided in
 * `request.options.schema`. Uses AJV for schema validation, which supports
 * the full JSON Schema draft-07 vocabulary.
 *
 * Interceptor contract:
 *   - `request.options.schema` -- a JSON Schema object to validate against.
 *                                 If absent, validation is skipped.
 *   - `request.body`           -- the raw request body string. If absent or
 *                                 empty, validation is skipped.
 *
 * Return value:
 *   On success:   { action: "continue" }
 *   On failure:   { action: "respond", status: 400, body: { error, details } }
 */

import Ajv from "ajv";

/** Options accepted by this interceptor (from x-opengateway-config). */
interface ValidateRequestOptions {
  /** A JSON Schema to validate the request body against. */
  schema?: object;
}

/** The request object passed to every interceptor by the gateway runtime. */
interface InterceptorRequest {
  options?: ValidateRequestOptions;
  headers?: Record<string, string>;
  // The gateway passes body as a pre-parsed object for application/json requests,
  // as a string for text/* requests, and as null/undefined when there is no body.
  body?: unknown;
}

/** Successful validation -- pass the request through to the upstream. */
interface ContinueResult {
  action: "continue";
}

/** Validation failure -- return a 400 response directly to the caller. */
interface RespondResult {
  action: "respond";
  status: number;
  body: {
    error: string;
    details: unknown;
  };
}

type InterceptorResult = ContinueResult | RespondResult;

// Instantiate AJV once (outside the handler) so the validator is reused across
// requests, avoiding repeated compilation overhead.
// strict: false enables compatibility with plain JSON Schema (draft-07) without
// requiring the additional AJV meta-schema keywords.
const ajv = new Ajv({ strict: false });

// Cache compiled validators by schema object identity. Schemas passed via
// `options` are typically the same object reference across requests (the
// interceptor module is long-lived), so this avoids re-compiling on every call.
const validatorCache = new WeakMap<object, ReturnType<typeof ajv.compile>>();

function getValidator(schema: object): ReturnType<typeof ajv.compile> {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

export function validateRequest(
  request: InterceptorRequest
): InterceptorResult {
  const schema = request.options && request.options.schema;

  // No schema configured -- nothing to validate.
  if (!schema) {
    return { action: "continue" };
  }

  // No body to validate -- pass through.
  if (request.body === null || request.body === undefined) {
    return { action: "continue" };
  }

  // The gateway sends application/json bodies as pre-parsed objects. For text
  // bodies (or any other string), attempt to parse the string as JSON.
  let parsed: unknown;
  if (typeof request.body === "string") {
    if (request.body === "") {
      return { action: "continue" };
    }
    try {
      parsed = JSON.parse(request.body);
    } catch {
      return {
        action: "respond",
        status: 400,
        body: {
          error: "Request validation failed",
          details: [{ message: "Request body is not valid JSON" }],
        },
      };
    }
  } else {
    // Already a parsed value (object, array, etc.) -- use directly.
    parsed = request.body;
  }

  const validate = getValidator(schema);
  const valid = validate(parsed);

  if (valid) {
    return { action: "continue" };
  }

  return {
    action: "respond",
    status: 400,
    body: {
      error: "Request validation failed",
      details: validate.errors,
    },
  };
}
