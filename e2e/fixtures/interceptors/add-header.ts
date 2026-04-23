import type { RequestInput, InterceptorOutput } from '@plenum/types';

export function onRequest(_request: RequestInput): InterceptorOutput {
  return {
    action: "continue",
    headers: { "x-intercepted": "true" },
  };
}
