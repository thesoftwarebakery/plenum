import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

test("interceptor receives options correctly", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-with-options.yaml",
      ],
      extraFiles: [
        { source: "interceptors/check-options.js", target: "/config/interceptors/check-options.js" },
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

    // Test with correct header - should succeed
    const resp1 = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-role": "admin" }
    });
    expect(resp1.status).toEqual(200);
    await resp1.body?.cancel();

    // Test with incorrect header - should get 403
    const resp2 = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-role": "user" }
    });
    expect(resp2.status).toEqual(403);
    const body2 = await resp2.json() as { error: string };
    expect(body2.error).toEqual("options check failed");

    // Verify upstream received the x-options-verified header (set by interceptor on the request)
    const requests = await wm.getRequests();
    expect(requests.length, "expected one request to upstream").toEqual(1);
    const upstreamHeaders = requests[0].request.headers;
    const headerKeys = Object.keys(upstreamHeaders);
    const verifiedKey = headerKeys.find(k => k.toLowerCase() === "x-options-verified");
    expect(verifiedKey !== undefined, `expected x-options-verified header in upstream request, got: ${headerKeys.join(", ")}`).toBe(true);
    expect(upstreamHeaders[verifiedKey!]).toEqual("true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("interceptor receives no options (backward compat)", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-add-header.yaml",
      ],
      extraFiles: [
        { source: "interceptors/add-header.js", target: "/config/interceptors/add-header.js" },
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
    await resp.body?.cancel();

    // Verify the upstream received the x-intercepted header
    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected at least one request to upstream").toBe(true);
    const upstreamHeaders = requests[0].request.headers;
    // Wiremock may capitalize header names
    const headerKeys = Object.keys(upstreamHeaders);
    const interceptedKey = headerKeys.find(k => k.toLowerCase() === "x-intercepted");
    expect(interceptedKey !== undefined, `expected x-intercepted header in upstream request, got: ${headerKeys.join(", ")}`).toBe(true);
    expect(upstreamHeaders[interceptedKey!]).toEqual("true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
