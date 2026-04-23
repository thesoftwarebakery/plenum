import type { PluginInput, PluginOutput } from '@plenum/types';

/**
 * Test plugin for response validation e2e tests.
 * Returns a valid or invalid response based on the x-plenum-backend config.
 *
 *   x-plenum-backend: { mode: "valid" }   -> returns { id: "1", name: "Widget" }
 *   x-plenum-backend: { mode: "invalid" }  -> returns { wrong_field: "no id here" }
 */

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export function handle(input: PluginInput): PluginOutput & { body?: unknown } {
  const mode = (input.config as Record<string, unknown> | undefined)?.mode;
  if (mode === "valid") {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { id: "1", name: "Widget" },
    };
  }
  // "invalid" mode or unknown -- return a body that fails the schema
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { wrong_field: "no id here" },
  };
}
