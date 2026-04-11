"use strict";
(() => {
  // src/add-header.ts
  globalThis.onRequest = function(request) {
    const headers = request.options && request.options.headers || {};
    return { action: "continue", headers };
  };
})();
