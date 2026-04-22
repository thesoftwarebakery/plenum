/**
 * on_request interceptor: reads x-user-tier header and stashes it in ctx.
 * Also verifies that ctx.gateway is populated with route and method.
 */
export function setCtx(input) {
  const userTier = input.headers['x-user-tier'] || 'unknown';

  // Verify gateway-populated ctx fields are present
  if (!input.ctx || !input.ctx.gateway) {
    return { action: 'respond', status: 500, body: 'ctx.gateway missing on request' };
  }
  if (!input.ctx.gateway.route || !input.ctx.gateway.method) {
    return {
      action: 'respond',
      status: 500,
      body: `ctx.gateway incomplete: ${JSON.stringify(input.ctx.gateway)}`,
    };
  }

  return {
    action: 'continue',
    ctx: {
      userTier,
      gatewayRoute: input.ctx.gateway.route,
      gatewayMethod: input.ctx.gateway.method,
    },
  };
}
