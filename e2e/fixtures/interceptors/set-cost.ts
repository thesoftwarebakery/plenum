import type { RequestInput, InterceptorReturn } from '@plenum/types';

/**
 * on_request interceptor: writes a fixed token cost of 5 into ctx.
 * Used by rate limit tests to exercise the cost_ctx_path feature.
 */
export function setCost(_input: RequestInput): InterceptorReturn {
  return {
    action: 'continue',
    ctx: { tokenCost: 5 },
  };
}
