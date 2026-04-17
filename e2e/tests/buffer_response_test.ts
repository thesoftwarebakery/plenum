import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

// Permutation 1: buffer-response false (default), no on_response_body interceptor
// Streams through; Content-Length is preserved.
test("buffer-response default (false): Content-Length preserved when streaming", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    const responseBody = JSON.stringify({ items: ["widget"] });
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        body: responseBody,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(new TextEncoder().encode(responseBody).length),
        },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);

    const contentLength = resp.headers.get("content-length");
    expect(contentLength !== null, "Content-Length should be present when streaming (no buffering)").toBe(true);

    const body = await resp.json() as { items: string[] };
    expect(body.items).toEqual(["widget"]);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// Permutation 2: buffer-response false (default), on_response_body interceptor configured
// Gateway should refuse to start (boot-time validation failure).
// (Permutation 3: buffer-response true + on_response_body is covered by interceptor_body_test.ts)
test("buffer-response default (false) with on_response_body: gateway refuses to start", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });

  let gateway: GatewayContainer | null = null;
  let threw = false;
  try {
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-interceptor-body.yaml",
        overlays: [
          "overlay-interceptor-body-upstream.yaml",
          "overlay-interceptor-modify-response-body.yaml",
        ],
        extraFiles: [
          { source: "interceptors/modify-response-body.js", target: "/config/interceptors/modify-response-body.js" },
        ],
      },
    });
  } catch (_e) {
    threw = true;
  }

  try {
    expect(threw, "gateway should have failed to start when on_response_body is configured without buffer-response: true").toBe(true);
  } finally {
    if (gateway) await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// Permutation 4: buffer-response true, no on_response_body interceptor
// Gateway starts without error; response is proxied correctly with body unchanged.
test("buffer-response true (no interceptor): gateway starts and proxies response correctly", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-body-upstream-buffered.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
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
    expect(body.items, "response body should be unchanged").toEqual(["widget"]);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
