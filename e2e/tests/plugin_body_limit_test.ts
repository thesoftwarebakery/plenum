import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

describe("plugin upstream: body size limits", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-plugin.yaml",
        overlays: [
          "overlay-body-limit-gateway.yaml",
          "overlay-plugin-upstream.yaml",
        ],
        extraFiles: [
          { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
        ],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("returns 413 when body exceeds limit on plugin route", async () => {
    // Global limit is 256 bytes; send 300 bytes
    const body = "x".repeat(300);
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(413);
    const json = await resp.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  test("returns 200 when body is within limit on plugin route", async () => {
    // Global limit is 256 bytes; send 100 bytes
    const body = "x".repeat(100);
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(200);
  });

  test("returns 413 for chunked upload exceeding limit on plugin route", async () => {
    const chunk = new TextEncoder().encode("x".repeat(150));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk); // 300 bytes total, exceeds 256-byte global limit
        controller.close();
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: stream,
      duplex: "half",
    });
    expect(resp.status).toEqual(413);
  });
});
