import type { PluginInput } from '@plenum/types';

type StreamMetadata = { status?: number; headers?: Record<string, string> };
type StreamChunk = { body?: unknown };

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

/**
 * Streams 3 chunks, pausing `id` milliseconds before each one.
 * /echo/100 → ~300ms total; /echo/0 → instant.
 * Used to exercise concurrent requests over the same IPC socket (#172).
 */
export async function* handle(
  input: PluginInput,
): AsyncGenerator<StreamMetadata | StreamChunk> {
  const delayMs = Number(input.request.params['id']) || 0;
  yield { status: 200, headers: { "content-type": "text/plain" } };
  for (let i = 0; i < 3; i++) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield { body: `chunk-${i}\n` };
  }
}
