import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("proxy", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({ network });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("proxies GET /products to upstream", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { items: string[] };
    expect(body.items).toEqual(["widget"]);
  });

  test("proxies parameterised path /products/{id}", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products/abc-123" },
      response: {
        status: 200,
        jsonBody: { id: "abc-123" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products/abc-123`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { id: string };
    expect(body.id).toEqual("abc-123");
  });
});
