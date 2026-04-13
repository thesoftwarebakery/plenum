export function onRequest(req) {
  if (req.body && req.body.flagged === true) {
    var newBody = Object.assign({}, req.body, { flagChecked: true });
    return { action: "continue", body: newBody };
  }
  return { action: "continue" };
}
