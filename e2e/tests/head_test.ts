import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("implicit HEAD support on HTTP upstream", () => {
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

  beforeEach(async () => {
    await wm.reset();
    await wm.resetRequests();
  });

  test("HEAD on a GET-only route returns 200 with empty body", async () => {
    await wm.stubFor({
      request: { method: "HEAD", urlPath: "/products" },
      response: {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, { method: "HEAD" });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("content-type")).toEqual("application/json");
    const body = await resp.text();
    expect(body).toEqual("");
  });

  test("upstream receives HEAD, not GET", async () => {
    await wm.stubFor({
      request: { method: "HEAD", urlPath: "/products" },
      response: { status: 200 },
    });

    await fetch(`${gateway.baseUrl}/products`, { method: "HEAD" });

    const requests = await wm.getRequests();
    const upstreamReq = requests.find(r => r.request.url === "/products");
    expect(upstreamReq).toBeDefined();
    expect(upstreamReq!.request.method).toEqual("HEAD");
  });

  test("HEAD on parameterised path works", async () => {
    await wm.stubFor({
      request: { method: "HEAD", urlPath: "/products/abc-123" },
      response: { status: 200 },
    });

    const resp = await fetch(`${gateway.baseUrl}/products/abc-123`, { method: "HEAD" });
    expect(resp.status).toEqual(200);
  });
});

describe("implicit HEAD support on static upstream", () => {
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

  test("HEAD /health returns 200 with correct headers and empty body", async () => {
    const resp = await fetch(`${gateway.baseUrl}/health`, { method: "HEAD" });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("content-type")).toEqual("application/json");
    const body = await resp.text();
    expect(body).toEqual("");
  });

  test("HEAD /docs returns 301 redirect with empty body", async () => {
    const resp = await fetch(`${gateway.baseUrl}/docs`, {
      method: "HEAD",
      redirect: "manual",
    });
    expect(resp.status).toEqual(301);
    expect(resp.headers.get("location")).toEqual("https://docs.example.com");
    const body = await resp.text();
    expect(body).toEqual("");
  });
});

describe("HEAD with request validation", () => {
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

  test("HEAD on GET route with validation does not 400 for missing body", async () => {
    await wm.stubFor({
      request: { method: "HEAD", urlPath: "/items" },
      response: { status: 200 },
    });

    const resp = await fetch(`${gateway.baseUrl}/items`, { method: "HEAD" });
    // Should succeed — GET /items has no request body requirement, so HEAD should not
    // trigger a "body missing" validation error.
    expect(resp.status).toEqual(200);
  });
});

describe("method not allowed returns 405", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({ network });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("DELETE on GET-only route returns 405 with Allow header", async () => {
    const resp = await fetch(`${gateway.baseUrl}/products`, { method: "DELETE" });
    expect(resp.status).toEqual(405);
    const allow = resp.headers.get("allow");
    expect(allow).toBeDefined();
    expect(allow).toContain("GET");
    expect(allow).toContain("HEAD");
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("method not allowed");
  });

  test("POST on GET-only route returns 405", async () => {
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(resp.status).toEqual(405);
    expect(resp.headers.get("allow")).toContain("GET");
  });

  test("PUT on GET-only route returns 405 with correct Allow header", async () => {
    const resp = await fetch(`${gateway.baseUrl}/products/abc`, { method: "PUT" });
    expect(resp.status).toEqual(405);
    const allow = resp.headers.get("allow");
    expect(allow).toContain("GET");
    expect(allow).toContain("HEAD");
  });
});
