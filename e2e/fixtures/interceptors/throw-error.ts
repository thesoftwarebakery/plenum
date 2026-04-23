import type { RequestInput, ResponseInput } from '@plenum/types';

export function onRequest(_request: RequestInput): never {
  throw new Error("boom from on_request");
}

export function beforeUpstream(_request: RequestInput): never {
  throw new Error("boom from before_upstream");
}

export function onResponse(_response: ResponseInput): never {
  throw new Error("boom from on_response");
}
