import type { RequestInput, InterceptorOutput } from '@plenum/types';

export async function onRequest(_request: RequestInput): Promise<InterceptorOutput> {
  // Attempt a network call without net permissions -- should throw.
  await fetch("http://example.com");
  return { action: "continue" };
}
