import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

test("two on_request interceptors both fire", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-chain.yaml",
      ],
      extraFiles: [
        { source: "interceptors/chain-first.js", target: "/config/interceptors/chain-first.js" },
        { source: "interceptors/chain-second.js", target: "/config/interceptors/chain-second.js" },
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

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected at least one request to upstream").toBe(true);
    const headers = requests[0].request.headers;
    const headerKeys = Object.keys(headers);

    const firstKey = headerKeys.find(k => k.toLowerCase() === "x-chain-first");
    expect(firstKey !== undefined, `expected x-chain-first header in upstream request, got: ${headerKeys.join(", ")}`).toBe(true);
    expect(headers[firstKey!]).toEqual("true");

    const secondKey = headerKeys.find(k => k.toLowerCase() === "x-chain-second");
    expect(secondKey !== undefined, `expected x-chain-second header in upstream request, got: ${headerKeys.join(", ")}`).toBe(true);
    expect(headers[secondKey!]).toEqual("true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
