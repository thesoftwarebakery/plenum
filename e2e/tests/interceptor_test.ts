import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

test("on_request interceptor adds header", async () => {
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

test("on_request interceptor short-circuits with 403", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-block.yaml",
      ],
      extraFiles: [
        { source: "interceptors/block-request.js", target: "/config/interceptors/block-request.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    // No wiremock stub needed — the request should never reach upstream

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("blocked by interceptor");

    // Verify upstream was NOT called
    const requests = await wm.getRequests();
    expect(requests.length, "expected no requests to upstream").toEqual(0);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
