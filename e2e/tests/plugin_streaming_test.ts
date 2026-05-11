import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

const CHUNK_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming.yaml"],
  extraFiles: [
    { source: "plugins/stream.js", target: "/config/plugins/stream.js" },
  ],
};

const LARGE_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-large.yaml"],
  extraFiles: [
    { source: "plugins/stream-large.js", target: "/config/plugins/stream-large.js" },
  ],
};

describe("plugin upstream: streaming responses", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: CHUNK_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("GET /echo returns concatenated chunks as full body", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("content-type")).toEqual("text/plain");
    const body = await resp.text();
    expect(body).toEqual("chunk-0\nchunk-1\nchunk-2\nchunk-3\nchunk-4\n");
  });

  test("GET /echo/{id} passes path params when streaming", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo/42`);
    expect(resp.status).toEqual(200);
    const body = await resp.text();
    expect(body).toBeTruthy();
    expect(body).toContain("chunk-0");
    expect(body).toContain("chunk-4");
  });
});

describe("plugin upstream: large streaming responses", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: LARGE_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("GET /echo returns 100 JSON objects as streamed response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("content-type")).toEqual("application/json");
    const body = await resp.text();
    const parsed = JSON.parse(body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toEqual(100);
    expect(parsed[0].id).toEqual(0);
    expect(parsed[99].id).toEqual(99);
  });
});
