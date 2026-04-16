/**
 * Response shaping utilities for database plugins.
 *
 * Handles two main transformations:
 * 1. Field mapping - Rename DB columns in the response (e.g., `created_at` → `createdAt`)
 * 2. JSON Pointer extraction - Extract specific parts of the result using RFC 6901 pointers
 */

/**
 * Configuration for response shaping.
 */
export interface ShapeConfig {
  /**
   * Maps DB column names to output keys.
   * For example: `{ created_at: "createdAt" }` will rename `created_at` to `createdAt`.
   */
  fields?: Record<string, string>;

  /**
   * JSON Pointer (RFC 6901) for extracting a specific part of the response.
   * For example: "/0" extracts the first element of an array.
   */
  returns?: string;
}

/**
 * Resolve a JSON Pointer (RFC 6901) path against data.
 *
 * Examples:
 * - "/0" - First element of array
 * - "/name" - Property "name" of object
 * - "/0/count" - Property "count" of first array element
 * - "/items/0" - First element of "items" array
 *
 * Returns null if the pointer cannot be resolved.
 */
export function resolveJsonPointer(data: unknown, pointer: string): unknown {
  // Empty pointer returns the data itself
  if (pointer === "" || pointer === "/") {
    return data;
  }

  // Pointer must start with /
  if (!pointer.startsWith("/")) {
    return null;
  }

  const tokens = pointer.split("/").slice(1); // Remove empty first element

  let current: unknown = data;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return null;
    }

    // Decode JSON pointer escape sequences
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");

    if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      if (!(key in (current as Record<string, unknown>))) {
        return null;
      }
      current = (current as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }

  return current;
}

/**
 * Apply field mapping to a single object.
 */
function applyFieldMapping(obj: Record<string, unknown>, fields: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key in fields) {
      result[fields[key]] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Apply field mapping to all objects in an array.
 */
function applyFieldMappingToArray(
  arr: Array<Record<string, unknown>>,
  fields: Record<string, string>
): Array<Record<string, unknown>> {
  return arr.map((item) => applyFieldMapping(item, fields));
}

/**
 * Shape a response by applying JSON Pointer extraction and field mapping.
 *
 * Order of operations:
 * 1. JSON Pointer extraction (if returns is specified)
 * 2. Field mapping (if fields is specified)
 *
 * Field mapping:
 * - If data is an array, applies mapping to all objects in the array
 * - If data is a single object, applies mapping to that object
 * - Unmapped columns pass through unchanged
 *
 * JSON Pointer extraction:
 * - Returns null if the pointer doesn't resolve (caller should convert to 404)
 *
 * Examples:
 * ```
 * shapeResponse(data, { fields: { created_at: "createdAt" } })
 * shapeResponse(data, { returns: "/0" })
 * shapeResponse(data, { fields: { created_at: "createdAt" }, returns: "/0" })
 * ```
 */
export function shapeResponse(data: unknown, config: ShapeConfig): unknown {
  let result: unknown = data;

  // Apply JSON Pointer extraction first if configured
  if (config.returns !== undefined) {
    result = resolveJsonPointer(result, config.returns);
  }

  // Apply field mapping if configured (to the result after pointer extraction)
  if (config.fields) {
    if (Array.isArray(result)) {
      result = applyFieldMappingToArray(result as Array<Record<string, unknown>>, config.fields);
    } else if (typeof result === "object" && result !== null) {
      result = applyFieldMapping(result as Record<string, unknown>, config.fields);
    }
  }

  return result;
}
