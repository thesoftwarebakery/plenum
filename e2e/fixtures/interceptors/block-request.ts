import type { RequestInput, InterceptorReturn } from '@plenum/types';

export function onRequest(_request: RequestInput): InterceptorReturn {
  return {
    action: "respond",
    status: 403,
    headers: { "content-type": "application/json" },
    body: { error: "blocked by interceptor" },
  };
}
