import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network, GenericContainer, Wait } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

const FIXTURES = {
  openapi: 'openapi-plugin-mysql.yaml',
  overlays: ['overlay-plugin-mysql.yaml'],
};

async function startMySQL(network: StartedNetwork): Promise<{
  container: StartedTestContainer;
  networkAlias: string;
  conn: mysql.Connection;
}> {
  const container = await new GenericContainer('mysql:8')
    .withNetwork(network)
    .withNetworkAliases('test-mysql')
    .withEnvironment({
      MYSQL_DATABASE: 'testdb',
      MYSQL_USER: 'testuser',
      MYSQL_PASSWORD: 'testpass',
      MYSQL_ROOT_PASSWORD: 'rootpass',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const conn = await mysql.createConnection({
    host: container.getHost(),
    port: container.getMappedPort(3306),
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  });

  await conn.execute(`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return { container, networkAlias: 'test-mysql', conn };
}

const DB_ENV = {
  DB_HOST: 'test-mysql',
  DB_PORT: '3306',
  DB_NAME: 'testdb',
  DB_USER: 'testuser',
  DB_PASSWORD: 'testpass',
};

describe('internal:mysql plugin', () => {
  let network: StartedNetwork;
  let db: Awaited<ReturnType<typeof startMySQL>>;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    db = await startMySQL(network);
    await db.conn.execute(
      'INSERT INTO users (name, created_at) VALUES (?, ?), (?, ?)',
      ['Alice', '2024-01-15 10:00:00', 'Bob', '2024-02-20 11:00:00'],
    );
    gateway = await startGateway({ network, fixtures: FIXTURES, environment: DB_ENV });
  }, 120_000);

  afterAll(async () => {
    await db.conn.end();
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

  test('DELETE /users/{id} removes user', async () => {
    const del = await fetch(`${gateway.baseUrl}/users/2`, { method: 'DELETE' });
    expect(del.status).toEqual(200);
    const get = await fetch(`${gateway.baseUrl}/users/2`);
    expect(get.status).toEqual(404);
  });
});
