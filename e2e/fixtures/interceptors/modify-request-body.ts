import type { RequestInput, InterceptorReturn } from '@plenum/types';

export function onRequest(req: RequestInput): InterceptorReturn {
  const newBody = Object.assign({}, req.body, { intercepted: true });
  return { action: "continue", body: newBody };
}
