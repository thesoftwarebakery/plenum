/**
 * Validates x-api-key header against the API_KEY environment variable.
 * Requires permissions.env: ["API_KEY"] to access the env var.
 */
exports.checkApiKey = function checkApiKey(request) {
  const expected = process.env.API_KEY;
  const provided = request.headers["x-api-key"];

  if (!provided || provided !== expected) {
    return {
      action: "respond",
      status: 401,
      headers: { "content-type": "application/json" },
      body: { error: "Invalid or missing API key" },
    };
  }

  return { action: "continue" };
};
