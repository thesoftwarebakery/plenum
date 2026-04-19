/**
 * PostgreSQL plugin using node-postgres (pg).
 *
 * Simplified version of the gateway-core/js/src/plugins/postgres.ts plugin,
 * implementing the same init/handle/validate contract.
 */

const { Pool } = require("pg");

let pool = null;

exports.init = async function init(options) {
  const config = {
    host: options.host || "localhost",
    port: parseInt(options.port, 10) || 5432,
    database: options.database,
    user: options.user,
    password: options.password,
    max: parseInt(options.max_connections, 10) || 10,
  };

  if (options.ssl) {
    config.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(config);

  // Verify connectivity
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }

  return { status: 200 };
};

exports.handle = async function handle(input) {
  if (!pool) {
    return { status: 500, headers: {}, body: { error: "pool not initialized" } };
  }

  const config = input.config || {};
  const request = input.request || {};

  // Simple interpolation: replace ${{namespace.key}} with values
  let query = config.query || "";
  const values = [];
  let paramIndex = 0;

  query = query.replace(/\$\{\{(\w+)\.(\w+)\}\}/g, (_match, namespace, key) => {
    let value = null;
    if (namespace === "path") {
      value = request.params?.[key] ?? null;
    } else if (namespace === "query") {
      value = request.query?.[key] ?? null;
    } else if (namespace === "body") {
      value = input.body?.[key] ?? null;
    }
    paramIndex++;
    values.push(value);
    return `$${paramIndex}`;
  });

  try {
    const result = await pool.query(query, values);
    let body = result.rows;

    // Apply field mapping
    if (config.fields && typeof config.fields === "object") {
      body = body.map((row) => {
        const mapped = {};
        for (const [col, val] of Object.entries(row)) {
          const newName = config.fields[col] || col;
          mapped[newName] = val;
        }
        return mapped;
      });
    }

    // Apply returns pointer (simplified JSON Pointer)
    if (config.returns) {
      const pointer = config.returns;
      if (pointer === "/0") {
        body = body[0] ?? null;
      }
    }

    if (body === null) {
      return { status: 404, headers: {}, body: { error: "not found" } };
    }

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body,
    };
  } catch (err) {
    return {
      status: 500,
      headers: {},
      body: { error: err.message },
    };
  }
};

exports.validate = async function validate(config) {
  if (!config || typeof config.query !== "string") {
    throw new Error("config.query must be a string");
  }
  return { valid: true };
};
