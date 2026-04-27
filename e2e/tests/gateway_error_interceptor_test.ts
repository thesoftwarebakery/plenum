import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

const GATEWAY_ERROR_INTERCEPTOR = "on-gateway-error.js";
const GATEWAY_ERROR_THROW_INTERCEPTOR = "on-gateway-error-throw.js";

// ---------------------------------------------------------------------------
// Suite: on_gateway_error intercepts a 504 timeout
// ---------------------------------------------------------------------------

describe("on_gateway_error intercepts a gateway 504", () => {
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
        overlays: [
          "overlay-timeout-gateway.yaml",
          "overlay-timeout-upstream.yaml",
          "overlay-gateway-error-interceptor.yaml",
        ],
        extraFiles: [
          { source: `interceptors/${GATEWAY_ERROR_INTERCEPTOR}`, target: `/config/interceptors/${GATEWAY_ERROR_INTERCEPTOR}` },
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

  test("on_gateway_error rewrites 504 to 503", async () => {
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
    expect(resp.status).toEqual(503);
    await resp.body?.cancel();
  });

  test("on_gateway_error adds x-gateway-error-code header", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/slow-op-timeout" },
      response: {
        status: 200,
        jsonBody: { result: "too slow" },
        headers: { "Content-Type": "application/json" },
        fixedDelayMilliseconds: 5000,
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/slow-op-timeout`);
    expect(resp.status).toEqual(503);
    expect(resp.headers.get("x-gateway-error-code")).toEqual("gateway_timeout");
    await resp.body?.cancel();
  });
});

// ---------------------------------------------------------------------------
// Suite: on_gateway_error intercepts a 413 body-too-large
// ---------------------------------------------------------------------------

describe("on_gateway_error intercepts a gateway 413", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-body-limit.yaml",
        overlays: [
          "overlay-body-limit-gateway.yaml",
          "overlay-body-limit-upstream.yaml",
          "overlay-gateway-error-interceptor.yaml",
        ],
        extraFiles: [
          { source: `interceptors/${GATEWAY_ERROR_INTERCEPTOR}`, target: `/config/interceptors/${GATEWAY_ERROR_INTERCEPTOR}` },
        ],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("on_gateway_error adds x-gateway-error-code header on 413", async () => {
    const body = "x".repeat(300); // exceeds 256-byte global limit
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(413);
    expect(resp.headers.get("x-gateway-error-code")).toEqual("payload_too_large");
    await resp.body?.cancel();
  });
});

// ---------------------------------------------------------------------------
// Test: on_gateway_error interceptor itself throws → hard 500
// ---------------------------------------------------------------------------

test("on_gateway_error interceptor error results in hard 500", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-timeout.yaml",
      overlays: [
        "overlay-timeout-gateway.yaml",
        "overlay-timeout-upstream.yaml",
        "overlay-gateway-error-throw-interceptor.yaml",
      ],
      extraFiles: [
        { source: `interceptors/${GATEWAY_ERROR_THROW_INTERCEPTOR}`, target: `/config/interceptors/${GATEWAY_ERROR_THROW_INTERCEPTOR}` },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
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
    expect(resp.status).toEqual(500);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// ---------------------------------------------------------------------------
// Suite: without on_gateway_error configured — default error responses unchanged
// ---------------------------------------------------------------------------

describe("without on_gateway_error, default gateway errors are unchanged", () => {
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
        overlays: [
          "overlay-timeout-gateway.yaml",
          "overlay-timeout-upstream.yaml",
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

  test("504 is returned as-is without on_gateway_error configured", async () => {
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
    expect(resp.headers.get("x-gateway-error-code")).toBeNull();
  });
});
