import type { RequestInput, ResponseInput, InterceptorOutput } from '@plenum/types';

export function onRequest(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-on-request": "fired" } };
}

export function beforeUpstream(_request: RequestInput): InterceptorOutput {
  return { action: "continue", headers: { "x-before-upstream": "fired" } };
}

export function onResponse(_response: ResponseInput): InterceptorOutput {
  return { action: "continue", headers: { "x-on-response": "fired" } };
}
