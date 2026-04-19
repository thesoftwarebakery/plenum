exports.onRequest = function onRequest(_request) {
  throw new Error("boom from on_request");
};

exports.beforeUpstream = function beforeUpstream(_request) {
  throw new Error("boom from before_upstream");
};

exports.onResponse = function onResponse(_response) {
  throw new Error("boom from on_response");
};
