import type { RequestInput, ResponseInput, InterceptorOutput } from '@plenum/types';

export function onRequestHeaders(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-on-request-headers": "fired" }, ctx: { onRequestHeadersFired: "yes" } };
}

export function onRequest(request: RequestInput): InterceptorOutput {
  return {
    action: "continue",
    headers: {
      "x-on-request": "fired",
      "x-ctx-from-headers-hook": String(request.ctx["onRequestHeadersFired"] ?? "missing"),
    },
  };
}

export function beforeUpstream(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-before-upstream": "fired" } };
}

export function onResponse(_response: ResponseInput): InterceptorOutput {
  return { action: "continue", headers: { "x-on-response": "fired" } };
}
