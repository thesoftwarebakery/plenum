import type { RequestInput, InterceptorReturn } from '@plenum/types';

export async function onRequest(request: RequestInput): Promise<InterceptorReturn> {
  const opts = request.options as { delay_ms?: number } | undefined;
  const delayMs = opts?.delay_ms || 5000;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return { action: "continue" };
}
