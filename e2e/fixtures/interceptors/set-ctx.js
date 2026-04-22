/**
 * on_request interceptor: reads x-user-tier header and stashes it in ctx.
 * Also verifies that input.route and input.method are populated.
 */
export function setCtx(input) {
  const userTier = input.headers['x-user-tier'] || 'unknown';

  // Verify gateway-populated input fields are present
  if (!input.route || !input.method) {
    return {
      action: 'respond',
      status: 500,
      body: `input.route/method missing: route=${input.route} method=${input.method}`,
    };
  }

  return {
    action: 'continue',
    ctx: {
      userTier,
      gatewayRoute: input.route,
      gatewayMethod: input.method,
    },
  };
}
