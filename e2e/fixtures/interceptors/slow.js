exports.onRequest = async function onRequest(request) {
  const delayMs = (request.options && request.options.delay_ms) || 5000;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return { action: "continue" };
};
