// src/plugins/postgres.ts
import postgres from "https://deno.land/x/postgresjs@v3.4.8/mod.js";

// src/plugins/shared/interpolate.ts
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) {
        return void 0;
      }
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      current = current[part];
    } else {
      return void 0;
    }
  }
  return current;
}
function parseQueryString(query) {
  const result = {};
  if (!query) return result;
  const params = new URLSearchParams(query);
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}
function resolveVariable(namespace, key, ctx) {
  switch (namespace) {
    case "path":
      return ctx.path[key];
    case "query":
      return ctx.query[key];
    case "body":
      return getNestedValue(ctx.body, key);
    case "auth":
      return getNestedValue(ctx.auth, key);
    default:
      return void 0;
  }
}
function interpolate(template, ctx) {
  const pattern = /\$\{\{(\w+)\.([^}]+)\}\}/g;
  return template.replace(pattern, (_match, namespace, key) => {
    const value = resolveVariable(namespace, key, ctx);
    if (value === void 0 || value === null) {
      return "null";
    }
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  });
}

// src/plugins/shared/shape.ts
function resolveJsonPointer(data, pointer) {
  if (pointer === "" || pointer === "/") {
    return data;
  }
  if (!pointer.startsWith("/")) {
    return null;
  }
  const tokens = pointer.split("/").slice(1);
  let current = data;
  for (const token of tokens) {
    if (current === null || current === void 0) {
      return null;
    }
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      if (!(key in current)) {
        return null;
      }
      current = current[key];
    } else {
      return null;
    }
  }
  return current;
}
function applyFieldMapping(obj, fields) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key in fields) {
      result[fields[key]] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
function applyFieldMappingToArray(arr, fields) {
  return arr.map((item) => applyFieldMapping(item, fields));
}
function shapeResponse(data, config) {
  let result = data;
  if (config.returns !== void 0) {
    result = resolveJsonPointer(result, config.returns);
  }
  if (config.fields) {
    if (Array.isArray(result)) {
      result = applyFieldMappingToArray(result, config.fields);
    } else if (typeof result === "object" && result !== null) {
      result = applyFieldMapping(result, config.fields);
    }
  }
  return result;
}

// src/plugins/postgres.ts
var sql = null;
async function init(options) {
  const connectionOptions = {
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password
  };
  if (options.max_connections !== void 0) {
    connectionOptions.max_connections = options.max_connections;
  }
  if (options.ssl !== void 0) {
    connectionOptions.ssl = options.ssl;
  }
  sql = postgres(connectionOptions);
  try {
    await sql`SELECT 1`;
  } catch (err) {
    sql = null;
    throw new Error(`PostgreSQL connection failed: ${err}`);
  }
}
async function handle(input) {
  if (sql === null) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "PostgreSQL plugin not initialized" }
    };
  }
  const ctx = {
    path: input.request.params,
    query: parseQueryString(input.request.query),
    body: input.body ?? null,
    auth: {}
    // Auth context TBD
  };
  const interpolatedQuery = interpolate(input.config.query, ctx);
  let result;
  try {
    result = await sql.unsafe(interpolatedQuery);
  } catch (err) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: `Query execution failed: ${err}` }
    };
  }
  const shapeConfig = {
    fields: input.config.fields,
    returns: input.config.returns
  };
  const shapedResult = shapeResponse(result, shapeConfig);
  if (input.config.returns !== void 0 && shapedResult === null) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: null
    };
  }
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: shapedResult
  };
}
function validate(config) {
  if (config === null || config === void 0) {
    return false;
  }
  if (typeof config !== "object") {
    return false;
  }
  const cfg = config;
  if (typeof cfg.query !== "string" || cfg.query.trim() === "") {
    return false;
  }
  if (cfg.fields !== void 0 && typeof cfg.fields !== "object") {
    return false;
  }
  if (cfg.returns !== void 0 && typeof cfg.returns !== "string") {
    return false;
  }
  return true;
}
export {
  handle,
  init,
  validate
};
