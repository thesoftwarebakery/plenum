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

  const total = 100;
  yield { body: "[\n" };
  for (let i = 0; i < total; i++) {
    yield { body: JSON.stringify({ id: i, data: "x".repeat(100) }) };
    if (i < total - 1) {
      yield { body: ",\n" };
    } else {
      yield { body: "\n" };
    }
  }
  yield { body: "]\n" };
}
