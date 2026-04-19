exports.onRequest = function onRequest(_request) {
  return { action: "continue", headers: { "x-on-request": "fired" } };
};

exports.beforeUpstream = function beforeUpstream(_request) {
  return { action: "continue", headers: { "x-before-upstream": "fired" } };
};

exports.onResponse = function onResponse(_response) {
  return { action: "continue", headers: { "x-on-response": "fired" } };
};
