/**
 * No-op echo plugin for measuring pure IPC overhead.
 */

exports.init = async function init(_params) {
  return { status: 200 };
};

exports.handle = async function handle(params) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: params.request || {},
  };
};

exports.validate = async function validate(_config) {
  return { valid: true };
};

exports.slow = async function slow(params) {
  const ms = (params && params.delay_ms) || 500;
  await new Promise((resolve) => setTimeout(resolve, ms));
  return { status: 200 };
};
