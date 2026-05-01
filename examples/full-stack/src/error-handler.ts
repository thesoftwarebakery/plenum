interface GatewayErrorInput {
  status: number;
  error: {
    code: string;
    message: string;
  };
}

interface InterceptorOutput {
  action: "continue";
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export function onError(input: GatewayErrorInput): InterceptorOutput {
  return {
    action: "continue",
    status: input.status === 504 ? 503 : input.status,
    headers: {
      "content-type": "application/json",
      "x-error-code": input.error.code,
    },
    body: {
      error: input.error.code,
      message: input.error.message,
      status: input.status === 504 ? 503 : input.status,
    },
  };
}
