import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

test("internal:add-header built-in injects configured header into upstream request", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-internal-add-header.yaml",
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

    // Verify the upstream received the x-builtin header
    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected at least one request to upstream").toBe(true);
    const upstreamHeaders = requests[0].request.headers;
    // Wiremock may capitalize header names
    const headerKeys = Object.keys(upstreamHeaders);
    const builtinKey = headerKeys.find(k => k.toLowerCase() === "x-builtin");
    expect(builtinKey !== undefined, `expected x-builtin header in upstream request, got: ${headerKeys.join(", ")}`).toBe(true);
    expect(upstreamHeaders[builtinKey!]).toEqual("true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
