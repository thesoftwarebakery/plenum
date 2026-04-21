import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("request timeout", () => {
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
        openapi: "openapi-timeout.yaml",
        overlays: ["overlay-timeout-gateway.yaml", "overlay-timeout-upstream.yaml"],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("returns 504 when upstream exceeds operation-level timeout", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/slow-op-timeout" },
      response: {
        status: 200,
        jsonBody: { result: "too slow" },
        headers: { "Content-Type": "application/json" },
        fixedDelayMilliseconds: 3000,
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/slow-op-timeout`);
    expect(resp.status).toEqual(504);
    const body = await resp.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  test("returns 504 when upstream exceeds global default timeout", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/slow-global-timeout" },
      response: {
        status: 200,
        jsonBody: { result: "too slow" },
        headers: { "Content-Type": "application/json" },
        fixedDelayMilliseconds: 5000,
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/slow-global-timeout`);
    expect(resp.status).toEqual(504);
    const body = await resp.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  test("returns 200 when upstream responds within timeout", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/fast" },
      response: {
        status: 200,
        jsonBody: { result: "quick" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/fast`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { result: string };
    expect(body.result).toEqual("quick");
  });
});
