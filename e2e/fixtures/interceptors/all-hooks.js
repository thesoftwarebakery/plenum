export function onRequest(_request) {
  return { action: "continue", headers: { "x-on-request": "fired" } };
}

export function beforeUpstream(_request) {
  return { action: "continue", headers: { "x-before-upstream": "fired" } };
}

export function onResponse(_response) {
  return { action: "continue", headers: { "x-on-response": "fired" } };
}
