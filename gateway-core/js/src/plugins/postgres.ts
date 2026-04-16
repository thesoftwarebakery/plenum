/**
 * PostgreSQL database plugin for OpenGateway.
 *
 * Uses postgres.js driver to connect to PostgreSQL and execute queries
 * with interpolation and response shaping support.
 */

import postgres from "https://deno.land/x/postgresjs@v3.4.8/mod.js";

import { interpolate, parseQueryString, type InterpolateContext } from "./shared/interpolate.ts";
import { shapeResponse, type ShapeConfig } from "./shared/shape.ts";

// Module-level SQL connection pool (established in init, reused in handle)
type Sql = ReturnType<typeof postgres>;
let sql: Sql | null = null;

/**
 * Configuration options for PostgreSQL connection.
 */
export interface PostgresOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max_connections?: number;
  ssl?: boolean;
}

/**
 * Request input to the plugin handle function.
 */
export interface PluginInput {
  request: {
    method: string;
    path: string;
    query: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  };
  config: {
    /** SQL query with ${{ }} interpolation support */
    query: string;
    /** Field mapping configuration (DB column -> output key) */
    fields?: Record<string, string>;
    /** JSON Pointer for extracting specific part of response */
    returns?: string;
  };
  body?: unknown;
}

/**
 * Response output from the plugin handle function.
 */
export interface PluginOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Initialize the PostgreSQL connection pool.
 *
 * Creates a connection pool using the provided options and verifies
 * connectivity with a simple SELECT 1 query.
 *
 * @param options - PostgreSQL connection options
 * @throws Error if connection fails
 */
export async function init(options: PostgresOptions): Promise<void> {
  const connectionOptions: Record<string, unknown> = {
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
  };

  if (options.max_connections !== undefined) {
    connectionOptions.max_connections = options.max_connections;
  }

  if (options.ssl !== undefined) {
    connectionOptions.ssl = options.ssl;
  }

  sql = postgres(connectionOptions);

  // Verify connection with SELECT 1
  try {
    await sql`SELECT 1`;
  } catch (err) {
    sql = null;
    throw new Error(`PostgreSQL connection failed: ${err}`);
  }
}

/**
 * Handle a database request.
 *
 * Executes the configured SQL query with interpolation and returns
 * the shaped response.
 *
 * @param input - The plugin input containing request, config, and optional body
 * @returns Plugin output with status, headers, and body
 */
export async function handle(input: PluginInput): Promise<PluginOutput> {
  if (sql === null) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: "PostgreSQL plugin not initialized" },
    };
  }

  // Build interpolation context from request
  const ctx: InterpolateContext = {
    path: input.request.params,
    query: parseQueryString(input.request.query),
    body: input.body ?? null,
    auth: {}, // Auth context TBD
  };

  // Interpolate the SQL query
  const interpolatedQuery = interpolate(input.config.query, ctx);

  let result: unknown;

  try {
    // Execute the query using template literal syntax
    // The interpolatedQuery may contain quoted strings, so we need to be careful
    // Using the unsafe version since we've already interpolated the values
    result = await sql.unsafe(interpolatedQuery);
  } catch (err) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: `Query execution failed: ${err}` },
    };
  }

  // Apply response shaping
  const shapeConfig: ShapeConfig = {
    fields: input.config.fields,
    returns: input.config.returns,
  };

  const shapedResult = shapeResponse(result, shapeConfig);

  // If returns pointer resolved to null, return 404
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

/**
 * Validate the backend configuration shape.
 *
 * Checks that the configuration object has the required structure
 * for a PostgreSQL backend.
 *
 * @param config - The configuration to validate
 * @returns true if valid, false otherwise
 */
export function validate(config: unknown): boolean {
  if (config === null || config === undefined) {
    return false;
  }

  if (typeof config !== "object") {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  // Must have a query string
  if (typeof cfg.query !== "string" || cfg.query.trim() === "") {
    return false;
  }

  // Optional fields must be an object if provided
  if (cfg.fields !== undefined && typeof cfg.fields !== "object") {
    return false;
  }

  // Optional returns must be a string if provided
  if (cfg.returns !== undefined && typeof cfg.returns !== "string") {
    return false;
  }

  return true;
}
