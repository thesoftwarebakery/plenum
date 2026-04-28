"use strict";
/**
 * rate-limit-rejector interceptor
 *
 * Rejects over-limit requests with 429 Too Many Requests when the gateway's
 * rate limit counter reports `rateLimits.over === true`.
 *
 * Designed for use with `enforce: false` rate limit configurations, where the
 * gateway counts and populates `rateLimits` but does not enforce natively. This
 * interceptor provides the enforcement step, allowing custom logic (e.g. logging,
 * metrics, header injection) to run in earlier interceptors before rejection.
 *
 * Usage (on_request hook):
 *   x-plenum-interceptor:
 *     - module: "internal:rate-limit-rejector"
 *       hook: on_request
 *       function: checkRateLimit
 */

exports.checkRateLimit = function checkRateLimit(input) {
  const rl = input.rateLimits;
  if (!rl || !rl.over) {
    return { action: "continue" };
  }
  return {
    action: "respond",
    status: 429,
    body: JSON.stringify({ error: "rate limit exceeded" }),
  };
};
