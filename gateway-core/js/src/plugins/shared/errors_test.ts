import { assertEquals } from "@std/assert";
import { mapDbErrorToHttp, isConnectionError, type DbError } from "./errors.ts";

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL connection refused returns 503",
  fn() {
    const error: DbError = { code: "ECONNREFUSED", message: "Connection refused" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 503);
    assertEquals(result.message, "Database unavailable");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL connection refused returns 503",
  fn() {
    const error: DbError = { code: "ECONNREFUSED", message: "connect ECONNREFUSED" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 503);
    assertEquals(result.message, "Database unavailable");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - Connection timeout returns 503",
  fn() {
    const error: DbError = { code: "ETIMEDOUT", message: "Connection timed out" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 503);
    assertEquals(result.message, "Database connection timed out");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL auth failed returns 500",
  fn() {
    const error: DbError = { code: "28P01", message: "password authentication failed" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Authentication failed");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL auth failed returns 500",
  fn() {
    const error: DbError = { errno: 1045, message: "Access denied for user" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Authentication failed");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MongoDB auth failed returns 500",
  fn() {
    const error: DbError = { code: 18, message: "Authentication failed" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Authentication failed");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL table not found returns 500",
  fn() {
    const error: DbError = { code: "42P01", message: "relation 'users' does not exist" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Table or collection not found");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL table not found returns 500",
  fn() {
    const error: DbError = { errno: 1146, message: "Table 'test.users' doesn't exist" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Table or collection not found");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL unique violation returns 409",
  fn() {
    const error: DbError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Duplicate or conflicting data");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL unique violation returns 409",
  fn() {
    const error: DbError = { errno: 1062, message: "Duplicate entry 'test' for key 'PRIMARY'" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Duplicate or conflicting data");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MongoDB duplicate key returns 409",
  fn() {
    const error: DbError = { code: 11000, message: "E11000 duplicate key error index" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Duplicate or conflicting data");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL foreign key violation returns 409",
  fn() {
    const error: DbError = { code: "23503", message: "insert or update violates foreign key constraint" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Referenced record not found");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL foreign key violation returns 409",
  fn() {
    const error: DbError = { errno: 1452, message: "Cannot add or update child row" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Referenced record not found");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL not null violation returns 409",
  fn() {
    const error: DbError = { code: "23502", message: "null value in column violates not-null constraint" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Required field is missing");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL not null violation returns 409",
  fn() {
    const error: DbError = { errno: 1048, message: "Column 'name' cannot be null" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Required field is missing");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL check violation returns 409",
  fn() {
    const error: DbError = { code: "23514", message: "new row violates check constraint" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 409);
    assertEquals(result.message, "Data validation failed");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - PostgreSQL query timeout returns 504",
  fn() {
    const error: DbError = { code: "57014", message: "query canceled" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 504);
    assertEquals(result.message, "Query execution timed out");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MySQL query timeout returns 504",
  fn() {
    const error: DbError = { errno: 1317, message: "Query execution was interrupted" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 504);
    assertEquals(result.message, "Query execution timed out");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MongoDB query timeout returns 504",
  fn() {
    const error: DbError = { code: 50, message: "Exceeded time limit" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 504);
    assertEquals(result.message, "Query execution timed out");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - MongoDB NamespaceNotFound returns 500",
  fn() {
    const error: DbError = { code: "NamespaceNotFound", message: "ns not found" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Table or collection not found");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - unknown error returns 500",
  fn() {
    const error: DbError = { code: "UNKNOWN", message: "Something went wrong" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Database error");
  },
});

Deno.test({
  name: "mapDbErrorToHttp - error with no code returns 500",
  fn() {
    const error: DbError = { message: "Generic database error" };
    const result = mapDbErrorToHttp(error);
    assertEquals(result.status, 500);
    assertEquals(result.message, "Database error");
  },
});

Deno.test({
  name: "isConnectionError - PostgreSQL ECONNREFUSED returns true",
  fn() {
    const error: DbError = { code: "ECONNREFUSED", message: "Connection refused" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - ETIMEDOUT returns true",
  fn() {
    const error: DbError = { code: "ETIMEDOUT", message: "Connection timed out" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - ECONNTIMEDOUT returns true",
  fn() {
    const error: DbError = { code: "ECONNTIMEDOUT", message: "Connection timed out" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - connection refused message returns true",
  fn() {
    const error: DbError = { code: "OTHER_ERROR", message: "connection refused" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - could not connect message returns true",
  fn() {
    const error: DbError = { code: "OTHER_ERROR", message: "could not connect to database" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - failed to connect message returns true",
  fn() {
    const error: DbError = { code: "OTHER_ERROR", message: "failed to connect" };
    assertEquals(isConnectionError(error), true);
  },
});

Deno.test({
  name: "isConnectionError - query error returns false",
  fn() {
    const error: DbError = { code: "23505", message: "duplicate key" };
    assertEquals(isConnectionError(error), false);
  },
});

Deno.test({
  name: "isConnectionError - auth error returns false",
  fn() {
    const error: DbError = { code: "28P01", message: "password authentication failed" };
    assertEquals(isConnectionError(error), false);
  },
});
