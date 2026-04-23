import type { RequestInput, InterceptorOutput } from '@plenum/types';

export function addSecond(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-chain-second": "true" } };
}
