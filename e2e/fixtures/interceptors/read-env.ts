import type { RequestInput, InterceptorReturn } from '@plenum/types';

export function readEnv(request: RequestInput): InterceptorReturn {
  const opts = request.options as { envVar: string } | undefined;
  const envVar = opts?.envVar;
  const value = envVar ? process.env[envVar] : undefined;
  return {
    action: "continue",
    headers: { "x-env-value": value || "not-set" }
  };
}
