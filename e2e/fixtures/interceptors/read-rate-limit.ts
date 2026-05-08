import type { ResponseInput, InterceptorReturn } from '@plenum/types';

/**
 * on_response interceptor: reads rateLimits from input and echoes the state
 * as response headers so tests can assert on the gateway's rate limit counters
 * without enforcement (enforce: false mode).
 */
export function readRateLimit(input: ResponseInput): InterceptorReturn {
  const rls = input.rateLimits;
  if (rls.length === 0) {
    return { action: 'continue' };
  }
  const rl = rls[0];
  return {
    action: 'continue',
    headers: {
      'x-rate-limit-over': String(rl.over),
      'x-rate-limit-count': String(rl.count),
      'x-rate-limit-limit': String(rl.limit),
    },
  };
}
