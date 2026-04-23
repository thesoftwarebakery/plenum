import type { RequestInput, ResponseInput, InterceptorOutput } from '@plenum/types';

export function beforeUpstream(_request: RequestInput): InterceptorOutput {
  return { action: "respond", status: 403, body: "should be ignored" };
}

export function onResponse(_response: ResponseInput): InterceptorOutput {
  return { action: "respond", status: 403, body: "should be ignored" };
}
