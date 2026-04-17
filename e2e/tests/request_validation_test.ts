import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("request validation", () => {
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
        openapi: "openapi-validation.yaml",
        overlays: [
          "overlay-upstream-validation.yaml",
          "overlay-validation-interceptors.yaml",
        ],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("valid POST body is proxied to upstream", async () => {
    await wm.stubFor({
      request: { method: "POST", urlPath: "/items" },
      response: {
        status: 201,
        jsonBody: { id: "123", name: "Widget" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget", quantity: 5 }),
    });
    expect(resp.status).toEqual(201);
    const body = await resp.json() as { id: string; name: string };
    expect(body.id).toEqual("123");
  });

  test("invalid POST body returns 400", async () => {
    const resp = await fetch(`${gateway.baseUrl}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget" }), // missing required 'quantity'
    });
    expect(resp.status).toEqual(400);
    const body = await resp.json() as { type: string; errors: Array<{ path: string; message: string }> };
    expect(body.type).toEqual("request-validation-error");
    expect(body.errors.length > 0).toBe(true);
  });

  test("non-JSON POST body returns 400", async () => {
    const resp = await fetch(`${gateway.baseUrl}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(resp.status).toEqual(400);
    const body = await resp.json() as { type: string };
    expect(body.type).toEqual("request-validation-error");
  });

  test("GET with no body is not validated and proxies normally", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/items" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/items`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();
  });
});
