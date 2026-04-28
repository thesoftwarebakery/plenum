import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("rate limit enforcement", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-rate-limit.yaml",
        overlays: ["overlay-rate-limit-enforce.yaml"],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
    await wm.stubFor({
      request: { method: "GET", urlPath: "/items" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("returns 429 after limit exceeded", async () => {
    const apiKey = "enforce-test-key";
    const url = `${gateway.baseUrl}/items`;
    const headers = { "x-api-key": apiKey };

    // First 3 requests are within limit (limit = 3)
    for (let i = 1; i <= 3; i++) {
      const resp = await fetch(url, { headers });
      expect(resp.status, `request ${i} should succeed`).toEqual(200);
      await resp.body?.cancel();
    }

    // 4th request exceeds the limit
    const resp4 = await fetch(url, { headers });
    expect(resp4.status).toEqual(429);
    const body = await resp4.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  test("requests with different identifiers are counted separately", async () => {
    // Send 4 requests with key-A (should 429 on 4th)
    for (let i = 1; i <= 3; i++) {
      const resp = await fetch(`${gateway.baseUrl}/items`, {
        headers: { "x-api-key": "key-a" },
      });
      expect(resp.status).toEqual(200);
      await resp.body?.cancel();
    }

    // key-B has not been used; first request should succeed
    const respB = await fetch(`${gateway.baseUrl}/items`, {
      headers: { "x-api-key": "key-b" },
    });
    expect(respB.status).toEqual(200);
    await respB.body?.cancel();

    // key-A is now over limit
    const respA4 = await fetch(`${gateway.baseUrl}/items`, {
      headers: { "x-api-key": "key-a" },
    });
    expect(respA4.status).toEqual(429);
    await respA4.body?.cancel();
  });

  test("missing identifier skips rate limiting", async () => {
    // No x-api-key header — identifier template fails to resolve, rate limiting skipped
    const resp = await fetch(`${gateway.baseUrl}/items`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();
  });
});

describe("rate limit log-only mode", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-rate-limit.yaml",
        overlays: ["overlay-rate-limit-log-only.yaml"],
        extraFiles: [
          { source: "interceptors/read-rate-limit.js", target: "/config/interceptors/read-rate-limit.js" },
        ],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
    await wm.stubFor({
      request: { method: "GET", urlPath: "/items" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("all requests succeed when enforce is false", async () => {
    const apiKey = "log-only-key";
    const url = `${gateway.baseUrl}/items`;
    const headers = { "x-api-key": apiKey };

    // Requests 1–3 should be under limit and return over: false
    for (let i = 1; i <= 3; i++) {
      const resp = await fetch(url, { headers });
      expect(resp.status, `request ${i} should succeed`).toEqual(200);
      expect(resp.headers.get("x-rate-limit-over")).toEqual("false");
      await resp.body?.cancel();
    }

    // Request 4 exceeds limit but is NOT rejected (enforce: false)
    const resp4 = await fetch(url, { headers });
    expect(resp4.status).toEqual(200);
    expect(resp4.headers.get("x-rate-limit-over")).toEqual("true");
    await resp4.body?.cancel();
  });
});

describe("rate limit cost from ctx", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-rate-limit.yaml",
        overlays: ["overlay-rate-limit-cost.yaml"],
        extraFiles: [
          { source: "interceptors/set-cost.js", target: "/config/interceptors/set-cost.js" },
        ],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
    await wm.stubFor({
      request: { method: "GET", urlPath: "/items" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("request cost is read from ctx, 3rd request (cost 5 each, limit 10) is rejected", async () => {
    const apiKey = "cost-test-key";
    const url = `${gateway.baseUrl}/items`;
    const headers = { "x-api-key": apiKey };

    // Request 1: count = 5, under limit of 10
    const resp1 = await fetch(url, { headers });
    expect(resp1.status).toEqual(200);
    await resp1.body?.cancel();

    // Request 2: count = 10, exactly at limit (10 > 10 = false, so allowed)
    const resp2 = await fetch(url, { headers });
    expect(resp2.status).toEqual(200);
    await resp2.body?.cancel();

    // Request 3: count = 15, over limit of 10 → 429
    const resp3 = await fetch(url, { headers });
    expect(resp3.status).toEqual(429);
    await resp3.body?.cancel();
  });
});
