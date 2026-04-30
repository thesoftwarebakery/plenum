interface PluginInput {
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    params: Record<string, unknown>;
    queryParams: Record<string, unknown>;
  };
  config: { action: string };
  operation: Record<string, unknown>;
  ctx: Record<string, unknown>;
  body?: { email?: string; password?: string };
}

interface PluginOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

let supertokensUri: string;
let apiKey: string;

export function init(options: { supertokensUri: string; apiKey: string }) {
  supertokensUri = options.supertokensUri;
  apiKey = options.apiKey;
  return {};
}

export async function handle(input: PluginInput): Promise<PluginOutput> {
  const action = input.config?.action;
  const body = input.body;

  if (!body?.email || !body?.password) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: { error: "email and password are required" },
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "api-key": apiKey,
  };

  if (action === "signup") {
    const resp = await fetch(`${supertokensUri}/recipe/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: body.email,
        password: body.password,
      }),
    });

    const result = await resp.json() as Record<string, unknown>;

    if (result.status !== "OK") {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: { error: result.status, message: result.message ?? "Signup failed" },
      };
    }

    return {
      status: 201,
      headers: { "content-type": "application/json" },
      body: { status: "OK", userId: (result.user as Record<string, unknown>)?.id },
    };
  }

  if (action === "signin") {
    // Sign in to get user ID
    const signinResp = await fetch(`${supertokensUri}/recipe/signin`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: body.email,
        password: body.password,
      }),
    });

    const signinResult = await signinResp.json() as Record<string, unknown>;

    if (signinResult.status !== "OK") {
      return {
        status: 401,
        headers: { "content-type": "application/json" },
        body: { error: "Invalid credentials" },
      };
    }

    const userId = (signinResult.user as Record<string, unknown>)?.id as string;

    // Create a session for the user
    const sessionResp = await fetch(`${supertokensUri}/recipe/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId,
        userDataInJWT: {},
        userDataInDatabase: {},
        enableAntiCsrf: false,
      }),
    });

    const sessionResult = await sessionResp.json() as Record<string, unknown>;
    const accessToken = sessionResult.accessToken as Record<string, unknown>;

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: {
        status: "OK",
        userId,
        accessToken: accessToken?.token,
      },
    };
  }

  return {
    status: 400,
    headers: { "content-type": "application/json" },
    body: { error: `Unknown action: ${action}` },
  };
}
