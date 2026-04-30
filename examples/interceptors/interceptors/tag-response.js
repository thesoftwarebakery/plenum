/**
 * Adds an x-powered-by header to the response,
 * and echoes the request ID from ctx.
 */
exports.tagResponse = function tagResponse(response) {
  return {
    action: "continue",
    headers: {
      "x-powered-by": "plenum",
      "x-request-id": response.ctx.requestId || "unknown",
    },
  };
};
