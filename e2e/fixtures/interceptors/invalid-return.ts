import type { RequestInput, ResponseInput } from '@plenum/types';

export function onRequest(_request: RequestInput): any {
  return { wrong: "shape" };
}

export function beforeUpstream(_request: RequestInput): any {
  return { wrong: "shape" };
}

export function onResponse(_response: ResponseInput): any {
  return { wrong: "shape" };
}
