import type { PluginInput } from '@plenum/types';

type StreamMetadata = { status?: number; headers?: Record<string, string> };
type StreamChunk = { body?: unknown };

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export async function* handle(
  input: PluginInput,
): AsyncGenerator<StreamMetadata | StreamChunk> {
  yield { status: 200, headers: { "content-type": "application/json" } };

  // Echo the request body and method back as a streamed JSON response.
  const response = JSON.stringify({
    method: input.request.method,
    body: (input as any).body,
  });
  yield { body: response };
}
