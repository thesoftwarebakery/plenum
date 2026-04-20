/**
 * MongoDB plugin using the official mongodb driver.
 *
 * Config per operation:
 *   collection: string           — collection name
 *   operation:  string           — find | findOne | insertOne | updateOne | deleteOne
 *   filter:     object           — query filter (supports ${{namespace.key}} interpolation)
 *   document:   object           — document for insert/update (supports interpolation)
 *   fields:     object           — field rename map (same as postgres/mysql plugins)
 *   returns:    string           — JSON Pointer, e.g. "/0" (same as postgres/mysql plugins)
 */

const { MongoClient } = require("mongodb");

let client = null;
let db = null;

exports.init = async function init(options) {
  let uri = options.uri;
  if (!uri) {
    const userPass = options.user
      ? `${encodeURIComponent(options.user)}:${encodeURIComponent(options.password || "")}@`
      : "";
    const host = options.host || "localhost";
    const port = options.port || 27017;
    const database = options.database || "test";
    uri = `mongodb://${userPass}${host}:${port}/${database}`;
  }

  client = new MongoClient(uri);
  await client.connect();

  const dbName = options.database || new URL(uri).pathname.slice(1) || "test";
  db = client.db(dbName);

  // Verify connectivity
  await db.command({ ping: 1 });

  return { status: 200 };
};

exports.handle = async function handle(input) {
  if (!client || !db) {
    return { status: 500, headers: {}, body: { error: "client not initialized" } };
  }

  const config = input.config || {};
  const request = input.request || {};

  if (!config.collection || typeof config.collection !== "string") {
    return { status: 500, headers: {}, body: { error: "config.collection must be a string" } };
  }

  const VALID_OPS = ["find", "findOne", "insertOne", "updateOne", "deleteOne"];
  if (!config.operation || !VALID_OPS.includes(config.operation)) {
    return {
      status: 500,
      headers: {},
      body: { error: `config.operation must be one of: ${VALID_OPS.join(", ")}` },
    };
  }

  // Interpolate ${{namespace.key}} values into a document (recursive)
  function interpolate(value) {
    if (typeof value === "string") {
      return value.replace(/\$\{\{(\w+)\.(\w+)\}\}/g, (_match, namespace, key) => {
        if (namespace === "path") return request.params?.[key] ?? null;
        if (namespace === "query") return request.query?.[key] ?? null;
        if (namespace === "body") return input.body?.[key] ?? null;
        return null;
      });
    }
    if (Array.isArray(value)) {
      return value.map(interpolate);
    }
    if (value !== null && typeof value === "object") {
      const result = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = interpolate(v);
      }
      return result;
    }
    return value;
  }

  const collection = db.collection(config.collection);
  const filter = interpolate(config.filter || {});
  const document = interpolate(config.document || {});

  try {
    let body;

    switch (config.operation) {
      case "find": {
        const cursor = collection.find(filter);
        body = await cursor.toArray();
        break;
      }
      case "findOne": {
        const doc = await collection.findOne(filter);
        if (doc === null) {
          return { status: 404, headers: {}, body: { error: "not found" } };
        }
        body = [doc];
        break;
      }
      case "insertOne": {
        const result = await collection.insertOne(document);
        body = [{ ...document, _id: result.insertedId }];
        break;
      }
      case "updateOne": {
        await collection.updateOne(filter, { $set: document });
        const updated = await collection.findOne(filter);
        if (updated === null) {
          return { status: 404, headers: {}, body: { error: "not found" } };
        }
        body = [updated];
        break;
      }
      case "deleteOne": {
        const result = await collection.deleteOne(filter);
        if (result.deletedCount === 0) {
          return { status: 404, headers: {}, body: { error: "not found" } };
        }
        body = [];
        break;
      }
    }

    // Apply field mapping
    if (config.fields && typeof config.fields === "object" && Array.isArray(body)) {
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
    if (config.returns === "/0") {
      body = body[0] ?? null;
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
  if (!config || typeof config.collection !== "string") {
    throw new Error("config.collection must be a string");
  }
  const VALID_OPS = ["find", "findOne", "insertOne", "updateOne", "deleteOne"];
  if (!config.operation || !VALID_OPS.includes(config.operation)) {
    throw new Error(`config.operation must be one of: ${VALID_OPS.join(", ")}`);
  }
  return { valid: true };
};
