import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { startGateway } from "../src/containers/gateway.ts";
import postgres from "postgres";

Deno.test({
  name: "postgres plugin: SELECT query with path param returns user",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.unsafe(`
    INSERT INTO users (name, created_at) VALUES
      ('Alice', NOW()),
      ('Bob', NOW())
  `);
  await client.end();

  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  const resp = await fetch(`${gateway.baseUrl}/users/1`);
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;
  assertEquals(body.id, 1);
  assertEquals(body.name, "Alice");
  assert(body.createdAt !== undefined, "should have createdAt field");
});

Deno.test({
  name: "postgres plugin: INSERT query creates user",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test POST /users
  const resp = await fetch(`${gateway.baseUrl}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Charlie" }),
  });
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;
  assertEquals(body.name, "Charlie");
  assertEquals(body.id, 1);
  assert(body.createdAt !== undefined, "should have createdAt field");
});

Deno.test({
  name: "postgres plugin: UPDATE query updates user",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.unsafe(`
    INSERT INTO users (name, created_at) VALUES ('Alice', NOW())
  `);
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test PUT /users/1
  const resp = await fetch(`${gateway.baseUrl}/users/1`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Alicia" }),
  });
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;
  assertEquals(body.name, "Alicia");
  assertEquals(body.id, 1);
});

Deno.test({
  name: "postgres plugin: DELETE query deletes user",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.unsafe(`
    INSERT INTO users (name, created_at) VALUES ('Alice', NOW())
  `);
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test DELETE /users/1
  const resp = await fetch(`${gateway.baseUrl}/users/1`, {
    method: "DELETE",
  });
  assertEquals(resp.status, 200);

  // Verify user is deleted
  const getResp = await fetch(`${gateway.baseUrl}/users/1`);
  assertEquals(getResp.status, 404);
});

Deno.test({
  name: "postgres plugin: field mapping renames created_at to createdAt",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.unsafe(`
    INSERT INTO users (name, created_at) VALUES ('Alice', '2024-01-15 10:30:00')
  `);
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test GET /users/1 - should have createdAt, not created_at
  const resp = await fetch(`${gateway.baseUrl}/users/1`);
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;

  // Verify field mapping: DB column 'created_at' -> API field 'createdAt'
  assert(
    body.createdAt !== undefined,
    `expected createdAt in response, got keys: ${Object.keys(body).join(", ")}`,
  );
  assert(
    body.created_at === undefined,
    `created_at should not be present (was mapped to createdAt)`,
  );
});

Deno.test({
  name: "postgres plugin: returns pointer extracts first row",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.unsafe(`
    INSERT INTO users (name, created_at) VALUES
      ('Alice', NOW()),
      ('Bob', NOW()),
      ('Charlie', NOW())
  `);
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test GET /users/1 - should return just the user object, not an array
  const resp = await fetch(`${gateway.baseUrl}/users/1`);
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;

  // Verify it's a single object, not an array
  assert(
    !Array.isArray(body),
    `expected single object, got array: ${JSON.stringify(body)}`,
  );
  assertEquals(body.name, "Alice");
  assertEquals(body.id, 1);
});

Deno.test({
  name: "postgres plugin: 404 for missing row",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();

  await using pg = await new PostgreSqlContainer("postgres:16")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .withDatabase("test")
    .withUsername("user")
    .withPassword("password")
    .start();

  const client = postgres(pg.getConnectionUri());
  await client.unsafe(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // No users inserted
  await client.end();

  // Start gateway with postgres plugin
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-postgres.yaml",
      overlays: ["overlay-postgres.yaml"],
    },
    environment: {
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_NAME: "test",
      DB_USER: "user",
      DB_PASSWORD: "password",
    },
  });

  // Test GET /users/999 - non-existent user
  const resp = await fetch(`${gateway.baseUrl}/users/999`);
  assertEquals(resp.status, 404);
});