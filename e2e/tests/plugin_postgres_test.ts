import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network, GenericContainer, Wait } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import pg from 'pg';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

const FIXTURES = {
  openapi: 'openapi-plugin-postgres.yaml',
  overlays: ['overlay-plugin-postgres.yaml'],
};

async function startPostgres(network: StartedNetwork): Promise<{
  container: StartedTestContainer;
  networkAlias: string;
  client: pg.Client;
}> {
  const container = await new GenericContainer('postgres:16')
    .withNetwork(network)
    .withNetworkAliases('test-postgres')
    .withEnvironment({
      POSTGRES_DB: 'testdb',
      POSTGRES_USER: 'testuser',
      POSTGRES_PASSWORD: 'testpass',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
    .start();

  const client = new pg.Client({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  });
  await client.connect();

  await client.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  return { container, networkAlias: 'test-postgres', client };
}

const DB_ENV = {
  DB_HOST: 'test-postgres',
  DB_PORT: '5432',
  DB_NAME: 'testdb',
  DB_USER: 'testuser',
  DB_PASSWORD: 'testpass',
};

describe('internal:postgres plugin', () => {
  let network: StartedNetwork;
  let db: Awaited<ReturnType<typeof startPostgres>>;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    db = await startPostgres(network);
    await db.client.query(`
      INSERT INTO users (name, created_at) VALUES
        ('Alice', '2024-01-15 10:00:00'),
        ('Bob', '2024-02-20 11:00:00')
    `);
    gateway = await startGateway({ network, fixtures: FIXTURES, environment: DB_ENV });
  });

  afterAll(async () => {
    await db.client.end();
    await gateway?.container.stop();
    await db?.container.stop();
    await network?.stop();
  });

  test('GET /users returns all rows', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toEqual(2);
  });

  test('GET /users/{id} returns single user', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/1`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.id).toEqual(1);
    expect(body.name).toEqual('Alice');
  });

  test('GET /users/{id} applies field mapping (created_at → createdAt)', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/1`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.createdAt).toBeDefined();
    expect(body.created_at).toBeUndefined();
  });

  test('GET /users/{id} returns 404 for missing row', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/999`);
    expect(resp.status).toEqual(404);
  });

  test('POST /users inserts and returns created user', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie' }),
    });
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.name).toEqual('Charlie');
    expect(typeof body.id).toEqual('number');
  });

  test('PUT /users/{id} updates user', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alicia' }),
    });
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.name).toEqual('Alicia');
  });

  test('DELETE /users/{id} removes user', async () => {
    const del = await fetch(`${gateway.baseUrl}/users/2`, { method: 'DELETE' });
    expect(del.status).toEqual(200);
    const get = await fetch(`${gateway.baseUrl}/users/2`);
    expect(get.status).toEqual(404);
  });
});
