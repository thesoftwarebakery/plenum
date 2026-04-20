/**
 * MySQL plugin using mysql2.
 *
 * Follows the same init/handle/validate contract as postgres.js.
 */

const mysql = require("mysql2/promise");

let pool = null;

exports.init = async function init(options) {
  pool = mysql.createPool({
    host: options.host || "localhost",
    port: parseInt(options.port, 10) || 3306,
    database: options.database,
    user: options.user,
    password: options.password,
    connectionLimit: parseInt(options.max_connections, 10) || 10,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
  });

  // Verify connectivity
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT 1");
  } finally {
    conn.release();
  }

  return { status: 200 };
};

exports.handle = async function handle(input) {
  if (!pool) {
    return { status: 500, headers: {}, body: { error: "pool not initialized" } };
  }

  const config = input.config || {};
  const request = input.request || {};

  // Interpolation: replace ${{namespace.key}} with ? placeholders (MySQL style)
  let query = config.query || "";
  const values = [];

  query = query.replace(/\$\{\{(\w+)\.(\w+)\}\}/g, (_match, namespace, key) => {
    let value = null;
    if (namespace === "path") {
      value = request.params?.[key] ?? null;
    } else if (namespace === "query") {
      value = request.query?.[key] ?? null;
    } else if (namespace === "body") {
      value = input.body?.[key] ?? null;
    }
    values.push(value);
    return "?";
  });

  try {
    // mysql2 returns [rows, fields]
    const [rows] = await pool.query(query, values);
    let body = rows;

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
      if (config.returns === "/0") {
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
