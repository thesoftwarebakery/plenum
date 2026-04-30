/**
 * Custom error handler that adds structured error details
 * and an x-error-code header to all gateway error responses.
 */
exports.onError = function onError(input) {
  return {
    action: "continue",
    status: input.status,
    headers: {
      "x-error-code": input.error.code,
    },
    body: {
      error: input.error.code,
      message: input.error.message,
      status: input.status,
    },
  };
};
