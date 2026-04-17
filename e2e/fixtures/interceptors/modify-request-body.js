exports.onRequest = function onRequest(req) {
  var newBody = Object.assign({}, req.body, { intercepted: true });
  return { action: "continue", body: newBody };
};
