import type { RequestInput, InterceptorOutput } from '@plenum/types';

export function addFirst(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-chain-first": "true" } };
}
