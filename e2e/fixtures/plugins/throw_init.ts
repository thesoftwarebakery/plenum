import type { PluginInput, PluginOutput } from '@plenum/types';

export function init(_options: unknown): Record<string, unknown> {
  throw new Error("deliberate init failure for testing");
}

export function handle(_input: PluginInput): PluginOutput & { body?: unknown } {
  return { status: 200, headers: {}, body: null };
}
