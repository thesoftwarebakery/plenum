/**
 * Tests for the query interpolation engine.
 */

import { assertEquals, assert } from "@std/assert";
import {
  interpolate,
  interpolateObject,
  parseQueryString,
  extractVariables,
  hasInterpolation,
  type InterpolateContext,
} from "./interpolate.ts";

Deno.test({
  name: "interpolate - basic path parameter",
  fn() {
    const ctx: InterpolateContext = {
      path: { id: "123" },
      query: {},
      body: null,
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE id = ${{path.id}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE id = '123'");
  },
});

Deno.test({
  name: "interpolate - query parameter",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: { search: "hello" },
      body: null,
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE name LIKE ${{query.search}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE name LIKE 'hello'");
  },
});

Deno.test({
  name: "interpolate - body field",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { name: "Alice" },
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE name = ${{body.name}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE name = 'Alice'");
  },
});

Deno.test({
  name: "interpolate - nested body access",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { user: { name: "Alice", email: "alice@example.com" } },
      auth: {},
    };

    const result = interpolate(
      "SELECT * FROM users WHERE name = ${{body.user.name}} AND email = ${{body.user.email}}",
      ctx
    );
    assertEquals(result, "SELECT * FROM users WHERE name = 'Alice' AND email = 'alice@example.com'");
  },
});

Deno.test({
  name: "interpolate - array index access",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { items: [{ id: "1" }, { id: "2" }, { id: "3" }] },
      auth: {},
    };

    const result = interpolate("SELECT * FROM items WHERE id = ${{body.items.0.id}}", ctx);
    assertEquals(result, "SELECT * FROM items WHERE id = '1'");
  },
});

Deno.test({
  name: "interpolate - unresolved variable returns null",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: {},
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE id = ${{path.missing}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE id = null");
  },
});

Deno.test({
  name: "interpolate - single quote escaping",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { name: "O'Brien" },
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE name = ${{body.name}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE name = 'O''Brien'");
  },
});

Deno.test({
  name: "interpolate - number passthrough",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { age: 25 },
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE age = ${{body.age}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE age = 25");
  },
});

Deno.test({
  name: "interpolate - boolean passthrough",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { active: true },
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE active = ${{body.active}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE active = true");
  },
});

Deno.test({
  name: "interpolate - multiple interpolations",
  fn() {
    const ctx: InterpolateContext = {
      path: { id: "123" },
      query: { search: "test" },
      body: { name: "Alice" },
      auth: {},
    };

    const result = interpolate(
      "SELECT * FROM users WHERE id = ${{path.id}} AND name = ${{body.name}} AND search = ${{query.search}}",
      ctx
    );
    assertEquals(result, "SELECT * FROM users WHERE id = '123' AND name = 'Alice' AND search = 'test'");
  },
});

Deno.test({
  name: "interpolate - no interpolation",
  fn() {
    const ctx: InterpolateContext = {
      path: { id: "123" },
      query: {},
      body: {},
      auth: {},
    };

    const result = interpolate("SELECT * FROM users", ctx);
    assertEquals(result, "SELECT * FROM users");
  },
});

Deno.test({
  name: "interpolate - auth context",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: {},
      auth: { userId: "user-456", roles: ["admin"] },
    };

    const result = interpolate("SELECT * FROM users WHERE auth_id = ${{auth.userId}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE auth_id = 'user-456'");
  },
});

Deno.test({
  name: "interpolate - nested auth context",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: {},
      auth: { user: { id: "user-789", name: "Bob" } },
    };

    const result = interpolate("SELECT * FROM users WHERE id = ${{auth.user.id}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE id = 'user-789'");
  },
});

Deno.test({
  name: "parseQueryString - basic parsing",
  fn() {
    const result = parseQueryString("name=Alice&age=25");
    assertEquals(result.name, "Alice");
    assertEquals(result.age, "25");
  },
});

Deno.test({
  name: "parseQueryString - empty string",
  fn() {
    const result = parseQueryString("");
    assertEquals(Object.keys(result).length, 0);
  },
});

Deno.test({
  name: "parseQueryString - with encoded characters",
  fn() {
    const result = parseQueryString("name=Alice%20Smith&city=New%20York");
    assertEquals(result.name, "Alice Smith");
    assertEquals(result.city, "New York");
  },
});

Deno.test({
  name: "parseQueryString - duplicate keys returns last value",
  fn() {
    const result = parseQueryString("name=Alice&name=Bob");
    assertEquals(result.name, "Bob");
  },
});

Deno.test({
  name: "extractVariables - extracts all variables",
  fn() {
    const result = extractVariables(
      "SELECT * FROM ${{path.table}} WHERE id = ${{path.id}} AND name = ${{query.search}}"
    );
    assertEquals(result.length, 3);
    assertEquals(result[0], { namespace: "path", key: "table" });
    assertEquals(result[1], { namespace: "path", key: "id" });
    assertEquals(result[2], { namespace: "query", key: "search" });
  },
});

Deno.test({
  name: "extractVariables - no variables",
  fn() {
    const result = extractVariables("SELECT * FROM users");
    assertEquals(result.length, 0);
  },
});

Deno.test({
  name: "extractVariables - nested key with dots",
  fn() {
    const result = extractVariables("SELECT * FROM users WHERE name = ${{body.user.name}}");
    assertEquals(result.length, 1);
    assertEquals(result[0], { namespace: "body", key: "user.name" });
  },
});

Deno.test({
  name: "hasInterpolation - returns true when interpolation present",
  fn() {
    const result = hasInterpolation("SELECT * FROM ${{path.table}}");
    assertEquals(result, true);
  },
});

Deno.test({
  name: "hasInterpolation - returns false when no interpolation",
  fn() {
    const result = hasInterpolation("SELECT * FROM users");
    assertEquals(result, false);
  },
});

Deno.test({
  name: "interpolateObject - recursively interpolates object",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { tableName: "users" },
      auth: {},
    };

    const obj = {
      sql: "SELECT * FROM ${{body.tableName}} WHERE id = ${{path.id}}",
      filter: { name: "Alice" },
    };

    const result = interpolateObject(obj, ctx) as Record<string, unknown>;
    assertEquals(result.sql, "SELECT * FROM 'users' WHERE id = null");
    assertEquals(result.filter, { name: "Alice" });
  },
});

Deno.test({
  name: "interpolateObject - array processing",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { tableName: "users" },
      auth: {},
    };

    const arr = [
      { sql: "SELECT * FROM ${{body.tableName}}" },
      { sql: "SELECT * FROM ${{body.tableName}}" },
    ];

    const result = interpolateObject(arr, ctx) as Array<Record<string, unknown>>;
    assertEquals(result.length, 2);
    assertEquals(result[0].sql, "SELECT * FROM 'users'");
    assertEquals(result[1].sql, "SELECT * FROM 'users'");
  },
});

Deno.test({
  name: "interpolateObject - primitives pass through",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: {},
      auth: {},
    };

    assertEquals(interpolateObject(42, ctx), 42);
    assertEquals(interpolateObject(true, ctx), true);
    assertEquals(interpolateObject(null, ctx), null);
  },
});

Deno.test({
  name: "interpolateObject - null/undefined return unchanged",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: {},
      auth: {},
    };

    assertEquals(interpolateObject(null, ctx), null);
    assertEquals(interpolateObject(undefined, ctx as InterpolateContext), undefined);
  },
});

Deno.test({
  name: "interpolate - Date handling",
  fn() {
    const ctx: InterpolateContext = {
      path: {},
      query: {},
      body: { createdAt: new Date("2024-01-15T10:30:00.000Z") },
      auth: {},
    };

    const result = interpolate("SELECT * FROM users WHERE created_at = ${{body.createdAt}}", ctx);
    assertEquals(result, "SELECT * FROM users WHERE created_at = '2024-01-15T10:30:00.000Z'");
  },
});
