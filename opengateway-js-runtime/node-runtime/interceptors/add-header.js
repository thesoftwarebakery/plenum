"use strict";
/**
 * add-header interceptor
 *
 * Adds headers to the proxied upstream request. The headers to add are
 * specified in `request.options.headers`.
 */

exports.onRequest = function onRequest(request) {
  const headers = (request.options && request.options.headers) || {};
  return { action: "continue", headers };
};
