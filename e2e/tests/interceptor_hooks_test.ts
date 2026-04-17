import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

const INTERCEPTOR_OPENAPI = "openapi-interceptor.yaml";
const UPSTREAM_OVERLAY = "overlay-interceptor-upstream.yaml";

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

describe("interceptor hooks", () => {
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
        openapi: INTERCEPTOR_OPENAPI,
        overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-all-hooks.yaml"],
        extraFiles: [
          { source: "interceptors/all-hooks.js", target: "/config/interceptors/all-hooks.js" },
        ],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);

    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("before_upstream adds header to upstream request", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected upstream to be called").toBe(true);
    const header = findHeader(requests[0].request.headers, "x-before-upstream");
    expect(header).toEqual("fired");
  });

  test("on_response adds header to client response", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    expect(resp.headers.get("x-on-response")).toEqual("fired");
  });

  test("all three hooks fire on a single request", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected upstream to be called").toBe(true);
    const upstreamHeaders = requests[0].request.headers;
    expect(findHeader(upstreamHeaders, "x-on-request")).toEqual("fired");
    expect(findHeader(upstreamHeaders, "x-before-upstream")).toEqual("fired");
    expect(resp.headers.get("x-on-response")).toEqual("fired");
  });
});

describe("on_response modifications", () => {
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
        openapi: INTERCEPTOR_OPENAPI,
        overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-on-response-modify.yaml"],
        extraFiles: [
          { source: "interceptors/on-response-modify.js", target: "/config/interceptors/on-response-modify.js" },
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

  test("rewrites response status code", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(203);
    await resp.body?.cancel();
  });

  test("adds and removes response headers", async () => {
    await wm.reset();
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: {},
        headers: { "Content-Type": "application/json", "x-remove-me": "present" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(203);
    await resp.body?.cancel();

    expect(resp.headers.get("x-added-by-interceptor")).toEqual("yes");
    expect(resp.headers.get("x-remove-me")).toEqual(null);
  });
});

describe("respond action ignored on committed phases", () => {
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
        openapi: INTERCEPTOR_OPENAPI,
        overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-respond-ignored.yaml"],
        extraFiles: [
          { source: "interceptors/respond-ignored.js", target: "/config/interceptors/respond-ignored.js" },
        ],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);

    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("before_upstream respond is ignored, request reaches upstream", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected upstream to be called").toBe(true);
  });

  test("on_response respond is ignored, original status returned", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();
  });
});
