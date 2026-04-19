import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

// Tests that an interceptor can make real async fetch() calls to an external
// service and use the response to modify the outgoing request.

test("fetch: interceptor can fetch external API and forward token", async () => {
  const network = await new Network().start();
  // "wiremock" is the primary upstream the gateway proxies to.
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  // "external-api" simulates an external token service the interceptor fetches.
  const externalApi = await startWiremock({ network, alias: "external-api" });
  const gateway = await startGateway({
    network,
    // bwrap sandboxing (triggered by permissions.net) requires namespace creation
    // which is blocked in Docker's default security profile.
    privileged: true,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-fetch.yaml",
      ],
      extraFiles: [
        { source: "interceptors/fetch-external.js", target: "/config/interceptors/fetch-external.js" },
      ],
    },
  });

  const upstreamWm = new WireMockClient(wiremock.adminUrl);
  const externalWm = new WireMockClient(externalApi.adminUrl);

  try {
    // Stub the external token API.
    await externalWm.stubFor({
      request: { method: "GET", urlPath: "/token" },
      response: {
        status: 200,
        jsonBody: { token: "secret-token-123" },
        headers: { "Content-Type": "application/json" },
      },
    });

    // Stub the primary upstream.
    await upstreamWm.stubFor({
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

    // Verify the upstream received the x-token header injected by the interceptor.
    const requests = await upstreamWm.getRequests();
    const upstreamHeaders = requests[0].request.headers;
    const headerKeys = Object.keys(upstreamHeaders);
    const tokenKey = headerKeys.find((k) => k.toLowerCase() === "x-token");
    expect(
      upstreamHeaders[tokenKey!],
      `expected x-token: secret-token-123 in upstream request, got headers: ${JSON.stringify(upstreamHeaders)}`,
    ).toEqual("secret-token-123");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await externalApi.container.stop();
    await network.stop();
  }
});
