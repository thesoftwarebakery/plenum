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

const STATUS_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-status.yaml"],
  extraFiles: [
    { source: "plugins/stream-status.js", target: "/config/plugins/stream-status.js" },
  ],
};

const INTERCEPTOR_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-interceptor.yaml"],
  extraFiles: [
    { source: "plugins/stream.js", target: "/config/plugins/stream.js" },
    { source: "interceptors/on-response-modify.js", target: "/config/interceptors/on-response-modify.js" },
  ],
};

const ERROR_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-error.yaml"],
  extraFiles: [
    { source: "plugins/stream-error.js", target: "/config/plugins/stream-error.js" },
  ],
};

const ECHO_BODY_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-echo-body.yaml"],
  extraFiles: [
    { source: "plugins/stream-echo-body.js", target: "/config/plugins/stream-echo-body.js" },
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

describe("plugin upstream: streaming with custom status and headers", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: STATUS_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("streaming plugin returns non-200 status code", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(201);
    const body = await resp.text();
    expect(body).toEqual("created\n");
  });

  test("streaming plugin returns custom response headers", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.headers.get("x-custom")).toEqual("header-value");
    expect(resp.headers.get("content-type")).toEqual("text/plain");
    await resp.body?.cancel();
  });
});

describe("plugin upstream: streaming with on_response interceptor", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: INTERCEPTOR_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("on_response interceptor rewrites status on streaming response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(203);
    const body = await resp.text();
    expect(body).toEqual("chunk-0\nchunk-1\nchunk-2\nchunk-3\nchunk-4\n");
  });

  test("on_response interceptor adds headers to streaming response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.headers.get("x-added-by-interceptor")).toEqual("yes");
    await resp.body?.cancel();
  });
});

describe("plugin upstream: streaming error mid-stream", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: ERROR_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("mid-stream error returns partial body without hanging", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    // Header was already sent with 200 before the error occurred.
    expect(resp.status).toEqual(200);
    const body = await resp.text();
    // Should contain the chunks yielded before the error.
    expect(body).toContain("chunk-0");
    expect(body).toContain("chunk-1");
  });
});

describe("plugin upstream: streaming with POST body", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: ECHO_BODY_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("POST request body is available to streaming plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello from POST" }),
    });
    expect(resp.status).toEqual(200);
    const body = await resp.json();
    expect(body.method).toEqual("POST");
    expect(body.body).toEqual({ message: "hello from POST" });
  });
});
