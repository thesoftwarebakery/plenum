import { generate } from "json-schema-faker";

interface PluginInput {
  request: {
    method: string;
    route: string;
    path: string;
    query: string;
    queryParams: Record<string, unknown>;
    headers: Record<string, string>;
    params: Record<string, unknown>;
  };
  config: unknown;
  operation: {
    operationId?: string;
    parameters?: unknown[];
    responses?: Record<
      string,
      {
        description?: string;
        content?: Record<
          string,
          { schema?: Record<string, unknown> }
        >;
      }
    >;
  };
  ctx: Record<string, unknown>;
  body?: unknown;
}

interface PluginOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * djb2 hash — turns a string into a stable integer seed for list endpoints.
 */
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function getResponseSchema(
  operation: PluginInput["operation"],
  statusCode = "200",
): Record<string, unknown> | null {
  const response = operation.responses?.[statusCode];
  if (!response) return null;
  const content = response.content;
  if (!content) return null;
  const mediaType = content["application/json"] || Object.values(content)[0];
  return mediaType?.schema ?? null;
}

export function init() {
  return {};
}

export async function handle(input: PluginInput): Promise<PluginOutput> {
  const schema = getResponseSchema(input.operation);

  if (!schema) {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: {},
    };
  }

  // Derive a stable integer seed:
  // - entity endpoints: id is already a typed integer (per OpenAPI schema)
  // - list endpoints: hash path + page so each route/page combination is distinct
  const idParam = input.request.params["id"] as number | undefined;
  const pageParam = input.request.queryParams["page"] as number | undefined;
  const seed = idParam != null
    ? idParam
    : hashCode(input.request.path + ":" + (pageParam ?? 0));

  try {
    const body = await generate(schema as any, {
      seed,
      useDefaultValue: true,
      useExamplesValue: true,
      minItems: 1,
      maxItems: 5,
    });
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body,
    };
  } catch {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "Failed to generate mock data from schema" },
    };
  }
}
