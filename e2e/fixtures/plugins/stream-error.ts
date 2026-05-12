import type { PluginInput } from '@plenum/types';

type StreamMetadata = { status?: number; headers?: Record<string, string> };
type StreamChunk = { body?: unknown };

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export async function* handle(
  input: PluginInput,
): AsyncGenerator<StreamMetadata | StreamChunk> {
  yield { status: 200, headers: { "content-type": "text/plain" } };

  yield { body: "chunk-0\n" };
  yield { body: "chunk-1\n" };

  throw new Error("deliberate mid-stream failure");
}
