// src/add-header.ts
function onRequest(request) {
  const headers = request.options && request.options.headers || {};
  return { action: "continue", headers };
}
export {
  onRequest
};
