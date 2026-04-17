/**
 * PostgreSQL database plugin for OpenGateway.
 *
 * Uses deno-postgres (Deno-native) driver to connect to PostgreSQL and
 * execute queries with interpolation and response shaping support.
 */

import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

import { interpolate, parseQueryString, type InterpolateContext } from "./shared/interpolate.ts";
import { shapeResponse, type ShapeConfig } from "./shared/shape.ts";

// Module-level connection pool (established in init, reused in handle)
let pool: Pool | null = null;

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
export async function init(options: PostgresOptions): Promise<Record<string, unknown>> {
  const connectionString =
    `postgresql://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`;

  pool = new Pool(connectionString, options.max_connections ?? 4, true);

  // Verify connection
  try {
    const client = await pool.connect();
    try {
      await client.queryObject("SELECT 1");
    } finally {
      client.release();
    }
  } catch (err) {
    pool = null;
    throw new Error(`PostgreSQL connection failed: ${err}`);
  }

  return { status: 200 };
}

/**
 * Handle a database request.
 *
 * Executes the configured SQL query with interpolation and returns
 * the shaped response.
 */
export async function handle(input: PluginInput): Promise<PluginOutput> {
  if (pool === null) {
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
    auth: {},
  };

  // Interpolate the SQL query
  const interpolatedQuery = interpolate(input.config.query, ctx);

  const client = await pool.connect();
  let result: unknown;

  try {
    const queryResult = await client.queryObject(interpolatedQuery);
    result = queryResult.rows;
  } catch (err) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { error: `Query execution failed: ${err}` },
    };
  } finally {
    client.release();
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
 */
export function validate(config: unknown): { valid: boolean; error?: string } {
  if (config === null || config === undefined) {
    return { valid: false, error: "config is required" };
  }

  if (typeof config !== "object") {
    return { valid: false, error: "config must be an object" };
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.query !== "string" || cfg.query.trim() === "") {
    return { valid: false, error: "query must be a non-empty string" };
  }

  if (cfg.fields !== undefined && typeof cfg.fields !== "object") {
    return { valid: false, error: "fields must be an object" };
  }

  if (cfg.returns !== undefined && typeof cfg.returns !== "string") {
    return { valid: false, error: "returns must be a string" };
  }

  return { valid: true };
}
