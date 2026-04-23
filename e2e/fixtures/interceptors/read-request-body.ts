import type { RequestInput, InterceptorReturn } from '@plenum/types';

export function onRequest(req: RequestInput): InterceptorReturn {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && body.flagged === true) {
    const newBody = Object.assign({}, body, { flagChecked: true });
    return { action: "continue", body: newBody };
  }
  return { action: "continue" };
}
