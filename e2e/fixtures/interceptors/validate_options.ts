import type { RequestInput, InterceptorOutput } from '@plenum/types';

export function validate(config: unknown): Record<string, never> {
  if (!config || typeof config !== 'object' || !('options' in config) || !(config as any).options?.required_key) {
    throw new Error("validate() failed: missing required_key in options");
  }
  return {};
}

export function onRequest(_input: RequestInput): InterceptorOutput {
  return { action: "continue" };
}
