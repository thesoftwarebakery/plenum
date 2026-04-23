import type { PluginInput, PluginOutput } from '@plenum/types';

export function init(_options: unknown): Record<string, unknown> {
  return {};
}

export function handle(input: PluginInput): PluginOutput & { body?: unknown } {
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    body: {
      method: input.request.method,
      path: input.request.path,
      params: input.request.params,
      query: input.request.query,
      headers: input.request.headers,
      config: input.config,
      requestBody: input.body,
      operation: input.operation,
    },
  };
}
