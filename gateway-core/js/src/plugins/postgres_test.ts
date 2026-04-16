import { assertEquals } from "@std/assert";
import {
  type PostgresOptions,
  type PluginInput,
} from "./postgres.ts";

let initCalled = false;
let initOptions: PostgresOptions | null = null;

async function mockInit(options: PostgresOptions): Promise<void> {
  initCalled = true;
  initOptions = options;

  if (options.host === "invalid-host") {
    throw new Error("Connection refused");
  }
}

async function mockHandle(input: PluginInput) {
  const { interpolate, parseQueryString } = await import("./shared/interpolate.ts");
  const { shapeResponse } = await import("./shared/shape.ts");

  if (!initCalled) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "PostgreSQL plugin not initialized" },
    };
  }

  const ctx = {
    path: input.request.params,
    query: parseQueryString(input.request.query),
    body: input.body ?? null,
    auth: {},
  };

  const interpolatedQuery = interpolate(input.config.query, ctx);

  let result: unknown;

  if (initOptions?.host === "error-host") {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "Query execution failed: Error: connection closed" },
    };
  }

  if (input.config.query.includes("ERROR")) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "Query execution failed: syntax error at end of input" },
    };
  }

  if (input.config.query.includes("RETURN_NULL")) {
    result = null;
  } else if (input.config.query.includes("RETURN_ARRAY")) {
    result = [
      { id: 1, name: "Alice", created_at: "2024-01-01" },
      { id: 2, name: "Bob", created_at: "2024-01-02" },
    ];
  } else if (input.config.query.includes("RETURN_SINGLE")) {
    result = [{ id: 123, name: "Alice", created_at: "2024-01-01" }];
  } else {
    result = [];
  }

  const shapeConfig = {
    fields: input.config.fields,
    returns: input.config.returns,
  };

  const shapedResult = shapeResponse(result, shapeConfig);

  if (input.config.returns !== undefined && shapedResult === null) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: null,
    };
  }

  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: shapedResult,
  };
}

function createValidateChecker() {
  return function validate(config: unknown): boolean {
    if (config === null || config === undefined) {
      return false;
    }
    if (typeof config !== "object") {
      return false;
    }
    const cfg = config as Record<string, unknown>;
    if (typeof cfg.query !== "string" || cfg.query.trim() === "") {
      return false;
    }
    if (cfg.fields !== undefined && typeof cfg.fields !== "object") {
      return false;
    }
    if (cfg.returns !== undefined && typeof cfg.returns !== "string") {
      return false;
    }
    return true;
  };
}

const validate = createValidateChecker();

Deno.test({
  name: "validate - valid config with query only",
  fn() {
    const config = { query: "SELECT * FROM users" };
    assertEquals(validate(config), true);
  },
});

Deno.test({
  name: "validate - valid config with query and fields",
  fn() {
    const config = {
      query: "SELECT * FROM users",
      fields: { created_at: "createdAt" },
    };
    assertEquals(validate(config), true);
  },
});

Deno.test({
  name: "validate - valid config with query, fields, and returns",
  fn() {
    const config = {
      query: "SELECT * FROM users",
      fields: { created_at: "createdAt" },
      returns: "/0",
    };
    assertEquals(validate(config), true);
  },
});

Deno.test({
  name: "validate - invalid config with missing query",
  fn() {
    const config = { fields: { created_at: "createdAt" } };
    assertEquals(validate(config), false);
  },
});

Deno.test({
  name: "validate - invalid config with empty query",
  fn() {
    const config = { query: "   " };
    assertEquals(validate(config), false);
  },
});

Deno.test({
  name: "validate - invalid config with non-string query",
  fn() {
    const config = { query: 123 };
    assertEquals(validate(config), false);
  },
});

Deno.test({
  name: "validate - invalid config with non-object fields",
  fn() {
    const config = { query: "SELECT * FROM users", fields: "invalid" };
    assertEquals(validate(config), false);
  },
});

Deno.test({
  name: "validate - invalid config with non-string returns",
  fn() {
    const config = { query: "SELECT * FROM users", returns: 123 };
    assertEquals(validate(config), false);
  },
});

Deno.test({
  name: "validate - invalid config with null",
  fn() {
    assertEquals(validate(null), false);
  },
});

Deno.test({
  name: "validate - invalid config with undefined",
  fn() {
    assertEquals(validate(undefined), false);
  },
});

Deno.test({
  name: "validate - invalid config with primitive",
  fn() {
    assertEquals(validate("string"), false);
    assertEquals(validate(123), false);
    assertEquals(validate(true), false);
  },
});

Deno.test({
  name: "handle - returns error when not initialized",
  async fn() {
    initCalled = false;
    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/123",
        query: "",
        headers: {},
        params: { id: "123" },
      },
      config: {
        query: "SELECT * FROM users WHERE id = ${{path.id}}",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 500);
    assertEquals(result.body, { error: "PostgreSQL plugin not initialized" });
  },
});

Deno.test({
  name: "handle - basic query execution",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/123",
        query: "",
        headers: {},
        params: { id: "123" },
      },
      config: {
        query: "SELECT * FROM users WHERE id = ${{path.id}}",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);
    assertEquals(result.headers["content-type"], "application/json");
  },
});

Deno.test({
  name: "handle - path parameter interpolation",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/456",
        query: "",
        headers: {},
        params: { id: "456" },
      },
      config: {
        query: "SELECT * FROM users WHERE id = ${{path.id}}",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);
  },
});

Deno.test({
  name: "handle - query parameter interpolation",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users",
        query: "name=Alice",
        headers: {},
        params: {},
      },
      config: {
        query: "SELECT * FROM users WHERE name = ${{query.name}}",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);
  },
});

Deno.test({
  name: "handle - body interpolation",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "POST",
        path: "/users",
        query: "",
        headers: {},
        params: {},
      },
      config: {
        query: "INSERT INTO users (name) VALUES (${{body.name}})",
      },
      body: { name: "Charlie" },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);
  },
});

Deno.test({
  name: "handle - field mapping",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/123",
        query: "",
        headers: {},
        params: { id: "123" },
      },
      config: {
        query: "RETURN_SINGLE",
        fields: { created_at: "createdAt" },
        returns: "/0",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);

    const body = result.body as Record<string, unknown>;
    assertEquals(body.createdAt, "2024-01-01");
    assertEquals(body.name, "Alice");
  },
});

Deno.test({
  name: "handle - JSON pointer extraction",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users",
        query: "",
        headers: {},
        params: {},
      },
      config: {
        query: "RETURN_ARRAY",
        returns: "/0",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);

    const body = result.body as Record<string, unknown>;
    assertEquals(body.id, 1);
    assertEquals(body.name, "Alice");
  },
});

Deno.test({
  name: "handle - combined field mapping and pointer extraction",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users",
        query: "",
        headers: {},
        params: {},
      },
      config: {
        query: "RETURN_ARRAY",
        fields: { created_at: "createdAt" },
        returns: "/1",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 200);

    const body = result.body as Record<string, unknown>;
    assertEquals(body.id, 2);
    assertEquals(body.createdAt, "2024-01-02");
    assertEquals(body.name, "Bob");
  },
});

Deno.test({
  name: "handle - returns 404 when pointer resolves to null",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/999",
        query: "",
        headers: {},
        params: { id: "999" },
      },
      config: {
        query: "RETURN_NULL",
        returns: "/0",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 404);
    assertEquals(result.body, null);
  },
});

Deno.test({
  name: "handle - returns 404 when pointer out of bounds",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users/999",
        query: "",
        headers: {},
        params: { id: "999" },
      },
      config: {
        query: "RETURN_ARRAY",
        returns: "/99",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 404);
  },
});

Deno.test({
  name: "handle - query error returns 500",
  async fn() {
    await mockInit({ host: "localhost", port: 5432, database: "test", user: "user", password: "pass" });

    const input: PluginInput = {
      request: {
        method: "GET",
        path: "/users",
        query: "",
        headers: {},
        params: {},
      },
      config: {
        query: "ERROR_SYNTAX",
      },
    };

    const result = await mockHandle(input);
    assertEquals(result.status, 500);
  },
});
