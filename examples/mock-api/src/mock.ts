import jsf from "json-schema-faker";

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
 * Simple djb2 hash — turns a string into a stable integer seed.
 */
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Extract the response schema for a given status code from the operation.
 */
function getResponseSchema(
  operation: PluginInput["operation"],
  statusCode = "200",
): Record<string, unknown> | null {
  const response = operation.responses?.[statusCode];
  if (!response) return null;
  const content = response.content;
  if (!content) return null;
  const mediaType =
    content["application/json"] || Object.values(content)[0];
  return mediaType?.schema ?? null;
}

export function init() {
  // json-schema-faker configuration
  jsf.option("useDefaultValue", true);
  jsf.option("useExamplesValue", true);
  jsf.option("minItems", 1);
  jsf.option("maxItems", 5);
  return {};
}

export function handle(input: PluginInput): PluginOutput {
  const schema = getResponseSchema(input.operation);

  if (!schema) {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: {},
    };
  }

  // Determine seed from path params or page query param (for deterministic output)
  const idParam = input.request.params["id"];
  const pageParam = input.request.queryParams["page"];
  const seed = idParam != null
    ? hashCode(String(idParam))
    : hashCode(input.request.path + ":" + (pageParam ?? 0));

  // LCG seeded random — same seed always produces same sequence
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  let s = seed;
  jsf.option("random", () => {
    s = (a * s + c) % m;
    return s / m;
  });

  try {
    const body = jsf.generate(schema as any);
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
