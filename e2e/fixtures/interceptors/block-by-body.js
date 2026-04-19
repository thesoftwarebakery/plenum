exports.onRequest = function onRequest(req) {
  if (req.body && req.body.block === true) {
    return {
      action: "respond",
      status: 403,
      headers: { "content-type": "application/json" },
      body: { error: "blocked by body" },
    };
  }
  return { action: "continue" };
};
