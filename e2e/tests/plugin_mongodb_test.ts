import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network, GenericContainer, Wait } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { MongoClient } from 'mongodb';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

const FIXTURES = {
  openapi: 'openapi-plugin-mongodb.yaml',
  overlays: ['overlay-plugin-mongodb.yaml'],
};

async function startMongoDB(network: StartedNetwork): Promise<{
  container: StartedTestContainer;
  networkAlias: string;
  client: MongoClient;
}> {
  const container = await new GenericContainer('mongo:7')
    .withNetwork(network)
    .withNetworkAliases('test-mongo')
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
    .start();

  const client = new MongoClient(
    `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/testdb`,
  );
  await client.connect();

  return { container, networkAlias: 'test-mongo', client };
}

const DB_ENV = {
  DB_HOST: 'test-mongo',
  DB_PORT: '27017',
  DB_NAME: 'testdb',
};

describe('internal:mongodb plugin', () => {
  let network: StartedNetwork;
  let db: Awaited<ReturnType<typeof startMongoDB>>;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    db = await startMongoDB(network);
    const col = db.client.db('testdb').collection('users');
    await col.insertMany([
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
    ]);
    gateway = await startGateway({ network, fixtures: FIXTURES, environment: DB_ENV });
  });

  afterAll(async () => {
    await db.client.close();
    await gateway?.container.stop();
    await db?.container.stop();
    await network?.stop();
  });

  test('GET /users returns all documents', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toEqual(2);
  });

  test('GET /users/{name} returns single document', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/Alice`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.name).toEqual('Alice');
    expect(body.role).toEqual('admin');
  });

  test('GET /users/{name} returns 404 for missing document', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users/Nonexistent`);
    expect(resp.status).toEqual(404);
  });

  test('POST /users inserts new document', async () => {
    const resp = await fetch(`${gateway.baseUrl}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie' }),
    });
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.name).toEqual('Charlie');
  });

  test('DELETE /users/{name} removes document', async () => {
    const del = await fetch(`${gateway.baseUrl}/users/Bob`, { method: 'DELETE' });
    expect(del.status).toEqual(200);
    const get = await fetch(`${gateway.baseUrl}/users/Bob`);
    expect(get.status).toEqual(404);
  });
});
