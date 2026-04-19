exports.beforeUpstream = function beforeUpstream(_request) {
  return { action: "respond", status: 403, body: "should be ignored" };
};

exports.onResponse = function onResponse(_response) {
  return { action: "respond", status: 403, body: "should be ignored" };
};
