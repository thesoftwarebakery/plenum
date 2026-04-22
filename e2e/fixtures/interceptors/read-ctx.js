/**
 * on_response interceptor: reads ctx written by the on_request interceptor
 * and reflects it back as response headers so the test can assert on them.
 */
export function readCtx(input) {
  return {
    action: 'continue',
    headers: {
      'x-ctx-user-tier': input.ctx?.userTier ?? 'not-set',
      'x-ctx-gateway-route': input.ctx?.gatewayRoute ?? 'not-set',
      'x-ctx-gateway-method': input.ctx?.gatewayMethod ?? 'not-set',
    },
  };
}
