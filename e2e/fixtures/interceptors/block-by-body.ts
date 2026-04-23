import type { RequestInput, InterceptorReturn } from '@plenum/types';

export function onRequest(req: RequestInput): InterceptorReturn {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && body.block === true) {
    return {
      action: "respond",
      status: 403,
      headers: { "content-type": "application/json" },
      body: { error: "blocked by body" },
    };
  }
  return { action: "continue" };
}
