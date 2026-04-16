/**
 * Tests for the response shaping utilities.
 */

import { assertEquals, assert } from "@std/assert";
import {
  shapeResponse,
  resolveJsonPointer,
  type ShapeConfig,
} from "./shape.ts";

Deno.test({
  name: "resolveJsonPointer - empty pointer returns data",
  fn() {
    assertEquals(resolveJsonPointer({ name: "test" }, ""), { name: "test" });
    assertEquals(resolveJsonPointer({ name: "test" }, "/"), { name: "test" });
  },
});

Deno.test({
  name: "resolveJsonPointer - array index access",
  fn() {
    const data = ["first", "second", "third"];
    assertEquals(resolveJsonPointer(data, "/0"), "first");
    assertEquals(resolveJsonPointer(data, "/1"), "second");
    assertEquals(resolveJsonPointer(data, "/2"), "third");
  },
});

Deno.test({
  name: "resolveJsonPointer - object property access",
  fn() {
    const data = { name: "Alice", age: 30 };
    assertEquals(resolveJsonPointer(data, "/name"), "Alice");
    assertEquals(resolveJsonPointer(data, "/age"), 30);
  },
});

Deno.test({
  name: "resolveJsonPointer - nested access",
  fn() {
    const data = [
      { id: 1, name: "Alice", created_at: "2024-01-01" },
      { id: 2, name: "Bob", created_at: "2024-01-02" },
    ];
    assertEquals(resolveJsonPointer(data, "/0"), { id: 1, name: "Alice", created_at: "2024-01-01" });
    assertEquals(resolveJsonPointer(data, "/0/name"), "Alice");
    assertEquals(resolveJsonPointer(data, "/1/created_at"), "2024-01-02");
  },
});

Deno.test({
  name: "resolveJsonPointer - out of bounds returns null",
  fn() {
    const data = ["first", "second"];
    assertEquals(resolveJsonPointer(data, "/99"), null);
    assertEquals(resolveJsonPointer(data, "/-1"), null);
  },
});

Deno.test({
  name: "resolveJsonPointer - missing property returns null",
  fn() {
    const data = { name: "Alice" };
    assertEquals(resolveJsonPointer(data, "/missing"), null);
  },
});

Deno.test({
  name: "resolveJsonPointer - null data returns null",
  fn() {
    assertEquals(resolveJsonPointer(null, "/0"), null);
    assertEquals(resolveJsonPointer(undefined, "/0"), null);
  },
});

Deno.test({
  name: "resolveJsonPointer - invalid pointer returns null",
  fn() {
    const data = ["first", "second"];
    assertEquals(resolveJsonPointer(data, "invalid"), null);
    assertEquals(resolveJsonPointer(data, "0"), null);
  },
});

Deno.test({
  name: "resolveJsonPointer - deep nesting",
  fn() {
    const data = { items: [{ name: "first" }, { name: "second" }] };
    assertEquals(resolveJsonPointer(data, "/items/0"), { name: "first" });
    assertEquals(resolveJsonPointer(data, "/items/0/name"), "first");
    assertEquals(resolveJsonPointer(data, "/items/1/name"), "second");
  },
});

Deno.test({
  name: "shapeResponse - field mapping on array",
  fn() {
    const data = [
      { id: 1, created_at: "2024-01-01", name: "Alice" },
      { id: 2, created_at: "2024-01-02", name: "Bob" },
    ];

    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
    };

    const result = shapeResponse(data, config) as Array<Record<string, unknown>>;
    assertEquals(result.length, 2);
    assertEquals(result[0], { id: 1, createdAt: "2024-01-01", name: "Alice" });
    assertEquals(result[1], { id: 2, createdAt: "2024-01-02", name: "Bob" });
  },
});

Deno.test({
  name: "shapeResponse - field mapping on single object",
  fn() {
    const data = { id: 1, created_at: "2024-01-01", name: "Alice" };

    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result, { id: 1, createdAt: "2024-01-01", name: "Alice" });
  },
});

Deno.test({
  name: "shapeResponse - multiple field mappings",
  fn() {
    const data = { id: 1, created_at: "2024-01-01", updated_at: "2024-01-02" };

    const config: ShapeConfig = {
      fields: { created_at: "createdAt", updated_at: "updatedAt" },
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result, { id: 1, createdAt: "2024-01-01", updatedAt: "2024-01-02" });
  },
});

Deno.test({
  name: "shapeResponse - unmapped columns pass through",
  fn() {
    const data = { id: 1, created_at: "2024-01-01", name: "Alice" };

    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result.id, 1);
    assertEquals(result.createdAt, "2024-01-01");
    assertEquals(result.name, "Alice");
  },
});

Deno.test({
  name: "shapeResponse - JSON Pointer extraction on array",
  fn() {
    const data = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];

    const config: ShapeConfig = {
      returns: "/0",
    };

    const result = shapeResponse(data, config);
    assertEquals(result, { id: 1, name: "Alice" });
  },
});

Deno.test({
  name: "shapeResponse - JSON Pointer extraction on object property",
  fn() {
    const data = { name: "Alice", items: [{ id: 1 }, { id: 2 }] };

    const config: ShapeConfig = {
      returns: "/name",
    };

    const result = shapeResponse(data, config);
    assertEquals(result, "Alice");
  },
});

Deno.test({
  name: "shapeResponse - combined field mapping and pointer extraction",
  fn() {
    const data = [
      { id: 1, created_at: "2024-01-01", name: "Alice" },
      { id: 2, created_at: "2024-01-02", name: "Bob" },
    ];

    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
      returns: "/0",
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result, { id: 1, createdAt: "2024-01-01", name: "Alice" });
  },
});

Deno.test({
  name: "shapeResponse - pointer extraction with nested field mapping",
  fn() {
    const data = [
      { id: 1, created_at: "2024-01-01", name: "Alice" },
      { id: 2, created_at: "2024-01-02", name: "Bob" },
    ];

    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
      returns: "/0/name",
    };

    const result = shapeResponse(data, config);
    assertEquals(result, "Alice");
  },
});

Deno.test({
  name: "shapeResponse - out of bounds pointer returns null",
  fn() {
    const data = [{ id: 1 }, { id: 2 }];

    const config: ShapeConfig = {
      returns: "/99",
    };

    assertEquals(shapeResponse(data, config), null);
  },
});

Deno.test({
  name: "shapeResponse - null data returns null",
  fn() {
    const config: ShapeConfig = {
      returns: "/0",
    };

    assertEquals(shapeResponse(null, config), null);
    assertEquals(shapeResponse(undefined, config), null);
  },
});

Deno.test({
  name: "shapeResponse - empty array with pointer returns null",
  fn() {
    const data: Array<unknown> = [];

    const config: ShapeConfig = {
      returns: "/0",
    };

    assertEquals(shapeResponse(data, config), null);
  },
});

Deno.test({
  name: "shapeResponse - no config returns data unchanged",
  fn() {
    const data = { id: 1, name: "Alice" };
    assertEquals(shapeResponse(data, {}), data);
  },
});

Deno.test({
  name: "shapeResponse - only fields, no returns",
  fn() {
    const data = { id: 1, created_at: "2024-01-01" };
    const config: ShapeConfig = {
      fields: { created_at: "createdAt" },
    };
    assertEquals(shapeResponse(data, config), { id: 1, createdAt: "2024-01-01" });
  },
});

Deno.test({
  name: "shapeResponse - only returns, no fields",
  fn() {
    const data = [{ id: 1 }, { id: 2 }];
    const config: ShapeConfig = {
      returns: "/1",
    };
    assertEquals(shapeResponse(data, config), { id: 2 });
  },
});

Deno.test({
  name: "shapeResponse - works with complex nested structures",
  fn() {
    const data = {
      users: [
        { user_id: 1, user_name: "Alice", created_at: "2024-01-01" },
        { user_id: 2, user_name: "Bob", created_at: "2024-01-02" },
      ],
      count: 2,
    };

    const config: ShapeConfig = {
      fields: { user_id: "id", user_name: "name", created_at: "createdAt" },
      returns: "/users/0",
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result, { id: 1, name: "Alice", createdAt: "2024-01-01" });
  },
});

Deno.test({
  name: "shapeResponse - field mapping with array of objects at pointer",
  fn() {
    const data = {
      items: [
        { item_id: 1, item_name: "First" },
        { item_id: 2, item_name: "Second" },
      ],
    };

    const config: ShapeConfig = {
      fields: { item_id: "id", item_name: "name" },
      returns: "/items",
    };

    const result = shapeResponse(data, config) as Array<Record<string, unknown>>;
    assertEquals(result.length, 2);
    assertEquals(result[0], { id: 1, name: "First" });
    assertEquals(result[1], { id: 2, name: "Second" });
  },
});

Deno.test({
  name: "resolveJsonPointer - works with primitives at root",
  fn() {
    assertEquals(resolveJsonPointer("hello", ""), "hello");
    assertEquals(resolveJsonPointer(42, ""), 42);
    assertEquals(resolveJsonPointer(true, ""), true);
  },
});

Deno.test({
  name: "shapeResponse - array field mapping renames keys",
  fn() {
    const data = [
      { a: 1, b: 2, c: 3 },
      { a: 4, b: 5, c: 6 },
      { a: 7, b: 8, c: 9 },
    ];

    const config: ShapeConfig = {
      fields: { a: "x", c: "z" },
    };

    const result = shapeResponse(data, config) as Array<Record<string, unknown>>;
    // Field mapping renames: a -> x, c -> z (original keys are replaced)
    assertEquals(result[0], { b: 2, x: 1, z: 3 });
    assertEquals(result[1], { b: 5, x: 4, z: 6 });
    assertEquals(result[2], { b: 8, x: 7, z: 9 });
  },
});

Deno.test({
  name: "shapeResponse - field mapping overrides existing keys",
  fn() {
    const data = { id: 1, name: "Alice" };

    const config: ShapeConfig = {
      fields: { name: "id" },
    };

    const result = shapeResponse(data, config) as Record<string, unknown>;
    assertEquals(result, { id: "Alice" });
  },
});
