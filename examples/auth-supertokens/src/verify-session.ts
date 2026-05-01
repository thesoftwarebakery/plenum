interface RequestInput {
  method: string;
  path: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
  queryParams: Record<string, unknown>;
  options?: {
    supertokensUri: string;
    apiKey: string;
  };
}

interface InterceptorOutput {
  action: "continue" | "respond";
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  ctx?: Record<string, unknown>;
}

export async function verifySession(request: RequestInput): Promise<InterceptorOutput> {
  const authHeader = request.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      action: "respond",
      status: 401,
      headers: { "content-type": "application/json" },
      body: { error: "Missing or invalid Authorization header" },
    };
  }

  const token = authHeader.slice("Bearer ".length);
  const supertokensUri = request.options?.supertokensUri;
  const apiKey = request.options?.apiKey;

  if (!supertokensUri) {
    return {
      action: "respond",
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "verify-session: supertokensUri not configured" },
    };
  }

  try {
    const resp = await fetch(`${supertokensUri}/recipe/session/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "api-key": apiKey } : {}),
      },
      body: JSON.stringify({
        accessToken: token,
        enableAntiCsrf: false,
        doAntiCsrfCheck: false,
        checkDatabase: false,
      }),
    });

    const result = await resp.json() as Record<string, unknown>;

    if (result.status !== "OK") {
      return {
        action: "respond",
        status: 401,
        headers: { "content-type": "application/json" },
        body: { error: "Invalid or expired session" },
      };
    }

    const session = result.session as Record<string, unknown>;
    const userId = session?.userId as string;

    return {
      action: "continue",
      headers: {
        "x-user-id": userId,
      },
      ctx: { userId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "respond",
      status: 502,
      headers: { "content-type": "application/json" },
      body: { error: `Session verification failed: ${message}` },
    };
  }
}
