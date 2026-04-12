export function onResponseBody(resp) {
  var newBody = Object.assign({}, resp.body, { intercepted: true });
  return { action: "continue", body: newBody };
}
