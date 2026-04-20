"use strict";
/**
 * auth-apikey interceptor
 *
 * Validates an API key passed in a request header. The expected key is read
 * from the environment variable named in `request.options.envVar`.
 * On Linux, environment variable access is gated by the sandbox permissions.
 */

const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against bufA to avoid leaking length via timing, but always return false.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

exports.checkApiKey = function checkApiKey(request) {
  const envVar = request.options && request.options.envVar;
  const headerName = request.options && request.options.header;

  if (!envVar || !headerName) {
    return {
      action: "respond",
      status: 500,
      body: { error: "auth-apikey: missing required options (envVar, header)" },
    };
  }

  const expectedKey = process.env[envVar];

  if (!expectedKey) {
    return {
      action: "respond",
      status: 500,
      body: { error: `auth-apikey: expected API key env var '${envVar}' is not set` },
    };
  }

  const actualKey = request.headers && request.headers[headerName];

  if (!actualKey || !timingSafeEqual(actualKey, expectedKey)) {
    return {
      action: "respond",
      status: 401,
      body: { error: "Unauthorized" },
    };
  }

  return { action: "continue" };
};
