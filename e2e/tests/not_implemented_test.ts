import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

describe("501 Not Implemented (no upstream)", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-not-implemented.yaml",
        overlays: [
          "overlay-not-implemented.yaml",
          "overlay-not-implemented-interceptor.yaml",
        ],
        extraFiles: [
          { source: "interceptors/block-request.js", target: "/config/interceptors/block-request.js" },
        ],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("path without upstream returns 501 with JSON error body", async () => {
    const resp = await fetch(`${gateway.baseUrl}/no-upstream`);
    expect(resp.status).toEqual(501);
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("upstream not configured");
  });

  test("501 response includes CORS headers when x-plenum-cors is configured", async () => {
    const resp = await fetch(`${gateway.baseUrl}/no-upstream-with-cors`, {
      headers: { "Origin": "https://example.com" },
    });
    expect(resp.status).toEqual(501);
    expect(resp.headers.get("access-control-allow-origin")).toEqual("https://example.com");
    expect(resp.headers.get("vary")).toContain("Origin");
    await resp.body?.cancel();
  });

  test("501 response does not include CORS headers for non-matching origin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/no-upstream-with-cors`, {
      headers: { "Origin": "https://evil.com" },
    });
    expect(resp.status).toEqual(501);
    expect(resp.headers.get("access-control-allow-origin")).toBeNull();
    await resp.body?.cancel();
  });

  test("interceptor can short-circuit before 501 is returned", async () => {
    const resp = await fetch(`${gateway.baseUrl}/no-upstream-with-interceptor`);
    // The block-request interceptor returns 403 before the 501 is reached
    expect(resp.status).toEqual(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("blocked by interceptor");
  });
});

describe("501 Not Implemented with on_gateway_error interceptor", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-not-implemented.yaml",
        overlays: [
          "overlay-not-implemented.yaml",
          "overlay-gateway-error-interceptor.yaml",
        ],
        extraFiles: [
          { source: "interceptors/on-gateway-error.js", target: "/config/interceptors/on-gateway-error.js" },
        ],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("on_gateway_error interceptor receives 501 and can add headers", async () => {
    const resp = await fetch(`${gateway.baseUrl}/no-upstream`);
    // The on-gateway-error interceptor adds x-gateway-error-code header
    expect(resp.headers.get("x-gateway-error-code")).toEqual("not_implemented");
    await resp.body?.cancel();
  });
});
