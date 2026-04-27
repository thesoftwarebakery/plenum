import type { GatewayErrorInput, InterceptorReturn } from '@plenum/types';

/**
 * on_gateway_error interceptor that always throws.
 * Used to verify that a failing on_gateway_error interceptor results in a hard 500.
 */
export function onGatewayError(_input: GatewayErrorInput): InterceptorReturn {
  throw new Error("on_gateway_error interceptor failed");
}
