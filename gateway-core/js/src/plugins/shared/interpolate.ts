/**
 * Query interpolation engine for database plugins.
 * 
 * Supports ${{namespace.key}} expressions with four namespaces:
 * - path.*    - URL path parameters
 * - query.*   - Query string parameters
 * - body.*    - Request body fields (supports nested access like body.user.name)
 * - auth.*    - Auth context (TBD)
 */

export interface InterpolateContext {
  /** URL path parameters */
  path: Record<string, string>;
  /** Query string parameters */
  query: Record<string, string>;
  /** Request body (parsed JSON) */
  body: unknown;
  /** Auth context (TBD) */
  auth: Record<string, unknown>;
}

/**
 * Extract a nested value from an object using dot notation.
 * Supports: "user.name", "items.0.name" (array index access)
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Parse a query string into a Record of key-value pairs.
 * Handles multiple values for the same key (returns last value).
 */
export function parseQueryString(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!query) return result;

  const params = new URLSearchParams(query);
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

/**
 * Resolve a variable reference like "path.id" or "body.user.name" to its value.
 * Returns undefined if the reference cannot be resolved.
 */
function resolveVariable(
  namespace: string,
  key: string,
  ctx: InterpolateContext
): unknown {
  switch (namespace) {
    case 'path':
      return ctx.path[key];
    case 'query':
      return ctx.query[key];
    case 'body':
      return getNestedValue(ctx.body, key);
    case 'auth':
      return getNestedValue(ctx.auth, key);
    default:
      return undefined;
  }
}

/**
 * Interpolate ${{namespace.key}} expressions in a string template.
 * 
 * Examples:
 * - "SELECT * FROM users WHERE id = ${{path.id}}"
 * - "SELECT * FROM items WHERE name = ${{query.search}}"
 * - "INSERT INTO users (name) VALUES (${{body.name}})"
 * - "SELECT * FROM users WHERE email = ${{body.user.email}}"
 * 
 * If a variable cannot be resolved, it is replaced with "null" for SQL safety.
 */
export function interpolate(template: string, ctx: InterpolateContext): string {
  // Pattern matches ${{namespace.key}} with support for nested keys
  const pattern = /\$\{\{(\w+)\.([^}]+)\}\}/g;

  return template.replace(pattern, (_match, namespace: string, key: string) => {
    const value = resolveVariable(namespace, key, ctx);

    if (value === undefined || value === null) {
      return 'null';
    }

    // For SQL, we need to properly escape strings
    if (typeof value === 'string') {
      // Escape single quotes by doubling them
      return `'${value.replace(/'/g, "''")}'`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    // For objects/arrays, JSON stringify (for SQL this might need adapter-specific handling)
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  });
}

/**
 * Recursively interpolate all string values in an object.
 * Used primarily for MongoDB filter objects and other structured queries.
 * 
 * Only string values are interpolated - other types pass through unchanged.
 */
export function interpolateObject(
  obj: unknown,
  ctx: InterpolateContext
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return interpolate(obj, ctx);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateObject(item, ctx));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateObject(value, ctx);
    }
    return result;
  }

  // Primitive types (number, boolean) pass through
  return obj;
}

/**
 * Extract all variable references from a template string.
 * Useful for validation and determining required context.
 */
export function extractVariables(template: string): Array<{ namespace: string; key: string }> {
  const pattern = /\$\{\{(\w+)\.([^}]+)\}\}/g;
  const variables: Array<{ namespace: string; key: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    variables.push({
      namespace: match[1],
      key: match[2],
    });
  }

  return variables;
}

/**
 * Check if a template contains any interpolation expressions.
 */
export function hasInterpolation(template: string): boolean {
  return /\$\{\{[^}]+\}\}/.test(template);
}
