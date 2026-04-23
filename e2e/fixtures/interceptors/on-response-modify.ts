import type { ResponseInput, InterceptorOutput } from '@plenum/types';

export function onResponse(_response: ResponseInput): InterceptorOutput {
  return {
    action: "continue",
    status: 203,
    headers: { "x-added-by-interceptor": "yes", "x-remove-me": null },
  };
}
