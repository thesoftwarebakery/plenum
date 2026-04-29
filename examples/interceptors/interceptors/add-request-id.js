/**
 * Adds an x-request-id header and shares it via ctx.
 */
exports.addRequestId = function addRequestId(_request) {
  const id = crypto.randomUUID();
  return {
    action: "continue",
    headers: { "x-request-id": id },
    ctx: { requestId: id },
  };
};
