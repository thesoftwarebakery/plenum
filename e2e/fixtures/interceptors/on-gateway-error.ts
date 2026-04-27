import type { GatewayErrorInput, InterceptorReturn } from '@plenum/types';

/**
 * on_gateway_error interceptor fixture.
 * - Rewrites status 504 → 503.
 * - Always adds an `x-gateway-error-code` response header containing the error code.
 */
export function onGatewayError(input: GatewayErrorInput): InterceptorReturn {
  const status = input.status === 504 ? 503 : input.status;
  return {
    action: "continue",
    status,
    headers: { "x-gateway-error-code": input.error.code },
  };
}
