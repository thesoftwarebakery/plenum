import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("body size limits", () => {
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
        openapi: "openapi-body-limit.yaml",
        overlays: [
          "overlay-body-limit-gateway.yaml",
          "overlay-body-limit-upstream.yaml",
          "overlay-body-limit-interceptor.yaml",
        ],
        extraFiles: [
          { source: "interceptors/add-header.js", target: "/config/interceptors/add-header.js" },
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

  beforeEach(async () => {
    await wm.reset();
    await wm.resetRequests();
  });

  test("returns 413 when body exceeds global limit", async () => {
    // Global limit is 256 bytes; send 300 bytes
    const body = "x".repeat(300);
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(413);
    const json = await resp.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  test("returns 200 when body is within global limit", async () => {
    await wm.stubFor({
      request: { method: "POST", urlPath: "/echo" },
      response: { status: 200, jsonBody: { ok: true }, headers: { "Content-Type": "application/json" } },
    });

    // Global limit is 256 bytes; send 100 bytes
    const body = "x".repeat(100);
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(200);
  });

  test("returns 413 when body exceeds per-route limit", async () => {
    // /strict has a 100-byte limit; send 150 bytes
    const body = "x".repeat(150);
    const resp = await fetch(`${gateway.baseUrl}/strict`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(413);
    const json = await resp.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  test("returns 200 when body is within per-route limit", async () => {
    await wm.stubFor({
      request: { method: "POST", urlPath: "/strict" },
      response: { status: 200, jsonBody: { ok: true }, headers: { "Content-Type": "application/json" } },
    });

    // /strict has a 100-byte limit; send 80 bytes
    const body = "x".repeat(80);
    const resp = await fetch(`${gateway.baseUrl}/strict`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(200);
  });

  test("returns 413 before interceptor runs when body exceeds limit", async () => {
    // /with-interceptor has a 50-byte limit and an on_request interceptor.
    // The 413 must fire before the interceptor, so wiremock must never receive the request.
    const body = "x".repeat(100);
    const resp = await fetch(`${gateway.baseUrl}/with-interceptor`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(413);

    const requests = await wm.getRequests();
    expect(requests).toHaveLength(0);
  });

  test("returns 413 for chunked upload exceeding global limit", async () => {
    // Send body as a ReadableStream so the client uses chunked transfer encoding,
    // exercising the incremental per-chunk byte counter.
    const chunk = new TextEncoder().encode("x".repeat(150));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk); // 300 bytes total, exceeds 256-byte global limit
        controller.close();
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: stream,
      duplex: "half",
    });
    expect(resp.status).toEqual(413);
  });

  test("per-route limit can be higher than global limit", async () => {
    await wm.stubFor({
      request: { method: "POST", urlPath: "/generous" },
      response: { status: 200, jsonBody: { ok: true }, headers: { "Content-Type": "application/json" } },
    });

    // /generous has a 1MB limit; global is 256 bytes. Send 512 bytes — allowed by route.
    const body = "x".repeat(512);
    const resp = await fetch(`${gateway.baseUrl}/generous`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(resp.status).toEqual(200);
  });
});
