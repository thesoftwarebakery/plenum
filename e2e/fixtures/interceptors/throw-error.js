export function onRequest(_request) {
  throw new Error("boom from on_request");
}

export function beforeUpstream(_request) {
  throw new Error("boom from before_upstream");
}

export function onResponse(_response) {
  throw new Error("boom from on_response");
}
