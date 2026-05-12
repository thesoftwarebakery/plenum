import type { PluginInput } from '@plenum/types';

type StreamMetadata = { status?: number; headers?: Record<string, string> };
type StreamChunk = { body?: unknown };

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export async function* handle(
  input: PluginInput,
): AsyncGenerator<StreamMetadata | StreamChunk> {
  yield { status: 201, headers: { "content-type": "text/plain", "x-custom": "header-value" } };

  yield { body: "created\n" };
}
