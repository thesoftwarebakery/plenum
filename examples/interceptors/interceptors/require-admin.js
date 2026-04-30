/**
 * Short-circuits with 403 unless the x-admin-key header is present.
 */
exports.requireAdmin = function requireAdmin(request) {
  if (!request.headers["x-admin-key"]) {
    return {
      action: "respond",
      status: 403,
      headers: { "content-type": "application/json" },
      body: { error: "Admin access required" },
    };
  }
  return { action: "continue" };
};
