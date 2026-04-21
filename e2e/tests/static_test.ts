import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

describe("static upstream", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-static.yaml",
        overlays: ["overlay-gateway.yaml", "overlay-static-upstream.yaml"],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("GET /health returns static JSON response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/health`);
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("content-type")).toEqual("application/json");
    const body = await resp.json() as { status: string };
    expect(body.status).toEqual("ok");
  });

  test("GET /ready returns 204 with empty body", async () => {
    const resp = await fetch(`${gateway.baseUrl}/ready`);
    expect(resp.status).toEqual(204);
    const text = await resp.text();
    expect(text).toEqual("");
  });

  test("GET /docs returns 301 redirect", async () => {
    const resp = await fetch(`${gateway.baseUrl}/docs`, { redirect: "manual" });
    expect(resp.status).toEqual(301);
    expect(resp.headers.get("location")).toEqual("https://docs.example.com");
  });
});
