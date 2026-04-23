import type { ResponseInput, InterceptorReturn } from '@plenum/types';

export function onResponseBody(resp: ResponseInput): InterceptorReturn {
  const newBody = Object.assign({}, resp.body, { intercepted: true });
  return { action: "continue", body: newBody };
}
