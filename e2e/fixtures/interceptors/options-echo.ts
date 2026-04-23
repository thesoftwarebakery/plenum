import type { RequestInput, InterceptorOutput } from '@plenum/types';

export function echoOptions(input: RequestInput): InterceptorOutput {
  const opts = input.options ?? {};
  const optsJson = JSON.stringify(opts);
  return { action: "continue", headers: { "x-interceptor-options": optsJson } };
}
