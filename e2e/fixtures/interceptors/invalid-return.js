exports.onRequest = function onRequest(_request) {
  return { wrong: "shape" };
};

exports.beforeUpstream = function beforeUpstream(_request) {
  return { wrong: "shape" };
};

exports.onResponse = function onResponse(_response) {
  return { wrong: "shape" };
};
