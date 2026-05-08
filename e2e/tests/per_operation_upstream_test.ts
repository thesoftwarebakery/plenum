import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("per-operation upstream override", () => {
  let network: StartedNetwork;
  let upstreamA: WiremockContainer;
  let upstreamB: WiremockContainer;
  let gateway: GatewayContainer;
  let wmA: WireMockClient;
  let wmB: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    upstreamA = await startWiremock({ network, alias: "upstream-a" });
    upstreamB = await startWiremock({ network, alias: "upstream-b" });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-per-op-upstream.yaml",
        overlays: ["overlay-per-op-upstream.yaml"],
      },
    });
    wmA = new WireMockClient(upstreamA.adminUrl);
    wmB = new WireMockClient(upstreamB.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await upstreamA?.container.stop();
    await upstreamB?.container.stop();
    await network?.stop();
  });

  test("GET /items routes to per-operation upstream (upstream-b)", async () => {
    await wmB.stubFor({
      request: { method: "GET", urlPath: "/items" },
      response: {
        status: 200,
        jsonBody: { source: "upstream-b" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/items`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { source: string };
    expect(body.source).toEqual("upstream-b");
  });

  test("POST /items routes to path-level upstream (upstream-a)", async () => {
    await wmA.stubFor({
      request: { method: "POST", urlPath: "/items" },
      response: {
        status: 201,
        jsonBody: { source: "upstream-a" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/items`, { method: "POST" });
    expect(resp.status).toEqual(201);
    const body = await resp.json() as { source: string };
    expect(body.source).toEqual("upstream-a");
  });

  test("GET /mixed routes to per-operation upstream when path has no upstream", async () => {
    await wmA.stubFor({
      request: { method: "GET", urlPath: "/mixed" },
      response: {
        status: 200,
        jsonBody: { source: "upstream-a" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/mixed`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { source: string };
    expect(body.source).toEqual("upstream-a");
  });

  test("POST /mixed returns 501 when path has no upstream and operation has no override", async () => {
    const resp = await fetch(`${gateway.baseUrl}/mixed`, { method: "POST" });
    expect(resp.status).toEqual(501);
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("upstream not configured");
  });
});
