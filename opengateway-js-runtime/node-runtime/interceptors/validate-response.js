"use strict";
/**
 * validate-response interceptor
 *
 * Validates the upstream response body against JSON Schemas provided in
 * `request.options.schemas`. Must be attached to the `on_response_body` hook.
 */

const Ajv = require("ajv");

const ajv = new Ajv({ strict: false });
const validatorCache = new Map();

function getValidator(schema) {
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

exports.validateResponse = function validateResponse(request) {
  const schemas = request.options && request.options.schemas;

  if (!schemas) {
    return { action: "continue" };
  }

  if (request.body === null || request.body === undefined) {
    return { action: "continue" };
  }

  const statusKey = request.status !== undefined ? String(request.status) : "";
  const schema = schemas[statusKey] || schemas["default"];

  if (!schema) {
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
};
