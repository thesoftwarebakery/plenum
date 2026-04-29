"use strict";
/**
 * validate-request interceptor
 *
 * Validates the incoming request body against a JSON Schema provided in
 * `request.options.schema`. Uses AJV for schema validation (draft-07).
 */

const Ajv = require("ajv");

const ajv = new Ajv({ strict: false, allErrors: true });
const validatorCache = new Map();

function getValidator(schema) {
  // Use JSON stringification as cache key since schema objects may not share identity.
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

exports.validateRequest = function validateRequest(request) {
  const schema =
    (request.options && request.options.schema) ||
    (request.operation &&
      request.operation.requestBody &&
      request.operation.requestBody.content &&
      request.operation.requestBody.content["application/json"] &&
      request.operation.requestBody.content["application/json"].schema);

  if (!schema) {
    return { action: "continue" };
  }

  if (request.body === null || request.body === undefined) {
    return { action: "continue" };
  }

  let parsed;
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
          type: "request-validation-error",
          title: "Request Validation Failed",
          status: 400,
          errors: [{ path: "", message: "Request body is not valid JSON" }],
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

  const errors = (validate.errors || []).map((e) => ({
    path: e.instancePath || "/",
    message: e.message || "validation failed",
  }));

  return {
    action: "respond",
    status: 400,
    body: {
      type: "request-validation-error",
      title: "Request Validation Failed",
      status: 400,
      errors,
    },
  };
};
