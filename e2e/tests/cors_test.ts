import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

describe("CORS support", () => {
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
        openapi: "openapi-cors.yaml",
        overlays: ["overlay-cors.yaml"],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("preflight OPTIONS request returns correct CORS headers", async () => {
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "OPTIONS",
      headers: {
        "Origin": "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resp.status).toEqual(204);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toEqual("https://example.com");
    expect(resp.headers.get("Access-Control-Allow-Credentials")).toEqual("true");
    expect(resp.headers.get("Access-Control-Allow-Methods")).toEqual("GET, POST, PUT");
    expect(resp.headers.get("Access-Control-Allow-Headers")).toEqual("Content-Type, Authorization");
    expect(resp.headers.get("Access-Control-Max-Age")).toEqual("3600");
    expect(resp.headers.get("Access-Control-Expose-Headers")).toEqual("X-Request-Id");
  });

  test("preflight rejects unknown origin", async () => {
    await wm.stubFor({
      request: { method: "OPTIONS", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "OPTIONS",
      headers: {
        "Origin": "https://evil.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    // Falls through to upstream since origin doesn't match
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("actual request returns CORS headers", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "Origin": "https://example.com" },
    });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toEqual("https://example.com");
    expect(resp.headers.get("Access-Control-Allow-Credentials")).toEqual("true");
    expect(resp.headers.get("Access-Control-Expose-Headers")).toEqual("X-Request-Id");
  });

  test("glob pattern origins match subdomains", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products/123" },
      response: {
        status: 200,
        jsonBody: { id: "123" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products/123`, {
      headers: { "Origin": "https://foo.example.com" },
    });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toEqual("https://foo.example.com");
  });

  test("glob pattern rejects non-matching origin", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products/123" },
      response: {
        status: 200,
        jsonBody: { id: "123" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products/123`, {
      headers: { "Origin": "https://example.com" },
    });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("no CORS config means no CORS headers", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/no-cors" },
      response: {
        status: 200,
        jsonBody: { ok: true },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/no-cors`, {
      headers: { "Origin": "https://example.com" },
    });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("preflight without Origin header falls through to upstream", async () => {
    await wm.stubFor({
      request: { method: "OPTIONS", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resp.status).toEqual(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
