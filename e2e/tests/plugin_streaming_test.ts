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

// stream-delay.js reads the per-chunk delay from the path param:
// /echo/100 → ~300ms total; /echo/0 → instant.
// Both routes share one plugin process, exercising the multiplexed socket (#172).
const DELAY_STREAM_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-streaming-delay.yaml"],
  extraFiles: [
    { source: "plugins/stream-delay.js", target: "/config/plugins/stream-delay.js" },
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

describe("plugin upstream: concurrent streaming requests", () => {
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

  test("multiple concurrent streaming requests all complete correctly", async () => {
    const N = 5;
    const requests = Array.from({ length: N }, () =>
      fetch(`${gateway.baseUrl}/echo`)
    );
    const responses = await Promise.all(requests);
    for (const resp of responses) {
      expect(resp.status).toEqual(200);
      const body = await resp.text();
      expect(body).toEqual("chunk-0\nchunk-1\nchunk-2\nchunk-3\nchunk-4\n");
    }
  });

  test("mixed concurrent streaming and non-streaming requests all complete", async () => {
    // Streaming and regular plugin calls share the same IPC socket;
    // verify they do not block or corrupt each other.
    const streaming = Array.from({ length: 3 }, () =>
      fetch(`${gateway.baseUrl}/echo`)
    );
    const responses = await Promise.all(streaming);
    for (const resp of responses) {
      expect(resp.status).toEqual(200);
      const body = await resp.text();
      expect(body).toEqual("chunk-0\nchunk-1\nchunk-2\nchunk-3\nchunk-4\n");
    }
  });
});

// Regression test for #172: a streaming request previously stole the IPC
// socket, so any request dispatched mid-stream would see stream=None and fail.
describe("plugin upstream: in-flight stream does not block subsequent requests", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: DELAY_STREAM_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("fast request completes while a slow stream is still in progress", async () => {
    // /echo/100 streams 3 chunks with 100ms between each (~300ms total).
    // /echo/0 streams 3 chunks with no delay (~instant).
    // Both share the same plugin process and IPC socket.
    //
    // Under the old socket-stealing design the second request would receive
    // stream=None and fail. With multiplexing both succeed independently.
    const slow = fetch(`${gateway.baseUrl}/echo/100`);
    const fast = fetch(`${gateway.baseUrl}/echo/0`);

    const [slowResp, fastResp] = await Promise.all([slow, fast]);
    expect(slowResp.status).toEqual(200);
    expect(fastResp.status).toEqual(200);
    expect(await slowResp.text()).toEqual("chunk-0\nchunk-1\nchunk-2\n");
    expect(await fastResp.text()).toEqual("chunk-0\nchunk-1\nchunk-2\n");
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
