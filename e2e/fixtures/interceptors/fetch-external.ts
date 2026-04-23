import type { RequestInput, InterceptorReturn } from '@plenum/types';

export async function onRequest(req: RequestInput): Promise<InterceptorReturn> {
  const opts = req.options as { externalHost: string };
  const resp = await fetch(`http://${opts.externalHost}/token`);
  const body = await resp.json() as Record<string, string>;
  return {
    action: "continue",
    headers: {
      ...req.headers,
      "x-token": body.token,
    },
  };
}
