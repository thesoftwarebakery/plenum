import type { PluginInput, PluginOutput } from '@plenum/types';

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export function validate(config: unknown): Record<string, unknown> {
  if (!config || !(config as Record<string, unknown>).table) {
    throw new Error("validate() failed: missing required field 'table'");
  }
  return {};
}

export function handle(_input: PluginInput): PluginOutput & { body?: unknown } {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true },
  };
}
