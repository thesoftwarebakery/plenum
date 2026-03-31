globalThis.beforeUpstream = function (_request) {
  return { action: "respond", status: 403, body: "should be ignored" };
};

globalThis.onResponse = function (_response) {
  return { action: "respond", status: 403, body: "should be ignored" };
};
