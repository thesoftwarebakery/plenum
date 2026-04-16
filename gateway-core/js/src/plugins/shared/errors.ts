/**
 * Shared error handling module for database plugins.
 *
 * Maps common database errors to appropriate HTTP status codes
 * for consistent error responses across PostgreSQL, MySQL, and MongoDB plugins.
 */

/**
 * Database error interface with common error properties.
 * Different drivers use different error code conventions:
 * - PostgreSQL (postgres.js): uses `code` for error codes like "ECONNREFUSED", "28P01"
 * - MySQL (mysql): uses `errno` for numeric error codes like 1045, 1146
 * - MongoDB: uses `code` for numeric error codes
 */
export interface DbError {
  code?: string | number;
  message: string;
  errno?: number;
  response?: {
    statusCode?: number;
  };
}

/**
 * HTTP error response structure.
 */
export interface HttpError {
  status: number;
  message: string;
}

// PostgreSQL error codes (postgres.js)
const POSTGRES_ERRORS = {
  ECONNREFUSED: "ECONNREFUSED",
  AUTH_FAILED: "28P01",
  TABLE_NOT_FOUND: "42P01",
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
  CHECK_VIOLATION: "23514",
  QUERY_TIMEOUT: "57014",
} as const;

// MySQL error codes (mysql driver)
const MYSQL_ERRORS = {
  ECONNREFUSED: "ECONNREFUSED",
  AUTH_FAILED: 1045,
  TABLE_NOT_FOUND: 1146,
  UNIQUE_VIOLATION: 1062,
  FOREIGN_KEY_VIOLATION: 1452,
  NOT_NULL_VIOLATION: 1048,
  QUERY_TIMEOUT: 1317,
} as const;

// MongoDB error codes
const MONGODB_ERRORS = {
  ECONNREFUSED: "ECONNREFUSED",
  AUTH_FAILED: 18,
  TABLE_NOT_FOUND: "NamespaceNotFound",
  DUPLICATE_KEY: 11000,
  QUERY_TIMEOUT: 50,
} as const;

/**
 * Maps a database error to an appropriate HTTP status code and message.
 *
 * @param error - The database error to map
 * @returns HTTP error response with status code and message
 */
export function mapDbErrorToHttp(error: DbError): HttpError {
  const code = error.code;
  const errno = error.errno;

  // Connection refused - most critical, return 503
  if (code === POSTGRES_ERRORS.ECONNREFUSED || code === MYSQL_ERRORS.ECONNREFUSED || code === "ECONNREFUSED") {
    return { status: 503, message: "Database unavailable" };
  }

  // Connection timeout
  if (code === "ETIMEDOUT" || code === "ECONNTIMEDOUT") {
    return { status: 503, message: "Database connection timed out" };
  }

  // Authentication failures - 500 Internal Server (not auth challenge, creds are server-side config)
  if (code === POSTGRES_ERRORS.AUTH_FAILED || errno === MYSQL_ERRORS.AUTH_FAILED || code === MONGODB_ERRORS.AUTH_FAILED) {
    return { status: 500, message: "Authentication failed" };
  }

  // Table/collection not found - 500 (misconfiguration)
  if (
    code === POSTGRES_ERRORS.TABLE_NOT_FOUND ||
    errno === MYSQL_ERRORS.TABLE_NOT_FOUND ||
    code === MONGODB_ERRORS.TABLE_NOT_FOUND
  ) {
    return { status: 500, message: "Table or collection not found" };
  }

  // Constraint violations - 409 Conflict
  if (
    code === POSTGRES_ERRORS.UNIQUE_VIOLATION ||
    errno === MYSQL_ERRORS.UNIQUE_VIOLATION ||
    code === MONGODB_ERRORS.DUPLICATE_KEY
  ) {
    return { status: 409, message: "Duplicate or conflicting data" };
  }

  if (
    code === POSTGRES_ERRORS.FOREIGN_KEY_VIOLATION ||
    errno === MYSQL_ERRORS.FOREIGN_KEY_VIOLATION
  ) {
    return { status: 409, message: "Referenced record not found" };
  }

  if (
    code === POSTGRES_ERRORS.NOT_NULL_VIOLATION ||
    errno === MYSQL_ERRORS.NOT_NULL_VIOLATION
  ) {
    return { status: 409, message: "Required field is missing" };
  }

  if (code === POSTGRES_ERRORS.CHECK_VIOLATION) {
    return { status: 409, message: "Data validation failed" };
  }

  // Query timeout - 504 Gateway Timeout
  if (
    code === POSTGRES_ERRORS.QUERY_TIMEOUT ||
    errno === MYSQL_ERRORS.QUERY_TIMEOUT ||
    code === MONGODB_ERRORS.QUERY_TIMEOUT
  ) {
    return { status: 504, message: "Query execution timed out" };
  }

  // MongoDB specific: namespace not found
  if (typeof code === "string" && code.includes("NamespaceNotFound")) {
    return { status: 500, message: "Table or collection not found" };
  }

  // Default to 500 Internal Server Error for unknown database errors
  return { status: 500, message: "Database error" };
}

/**
 * Detects if an error is a connection failure.
 *
 * @param error - The error to check
 * @returns true if this is a connection-related error
 */
export function isConnectionError(error: DbError): boolean {
  const code = error.code;

  if (code === POSTGRES_ERRORS.ECONNREFUSED || code === MYSQL_ERRORS.ECONNREFUSED || code === "ECONNREFUSED") {
    return true;
  }

  if (code === "ETIMEDOUT" || code === "ECONNTIMEDOUT") {
    return true;
  }

  // Check for connection-related messages
  const msg = error.message.toLowerCase();
  if (msg.includes("connection refused") || msg.includes("connect econnrefused")) {
    return true;
  }

  if (msg.includes("connection timeout") || msg.includes("connect timed out")) {
    return true;
  }

  if (msg.includes("could not connect") || msg.includes("failed to connect")) {
    return true;
  }

  return false;
}
