import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

// Tests that an interceptor can make real async fetch() calls to an external
// service and use the response to modify the outgoing request.

Deno.test({ name: "fetch: interceptor can fetch external API and forward token", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  // "wiremock" is the primary upstream the gateway proxies to.
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  // "external-api" simulates an external token service the interceptor fetches.
  const externalApi = await startWiremock({ network, alias: "external-api" });
  const gateway = await startGateway({
    network,
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
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    // Verify the upstream received the x-token header injected by the interceptor.
    const requests = await upstreamWm.getRequests();
    const upstreamHeaders = requests[0].request.headers;
    const headerKeys = Object.keys(upstreamHeaders);
    const tokenKey = headerKeys.find((k) => k.toLowerCase() === "x-token");
    assertEquals(
      upstreamHeaders[tokenKey!],
      "secret-token-123",
      `expected x-token: secret-token-123 in upstream request, got headers: ${JSON.stringify(upstreamHeaders)}`,
    );
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await externalApi.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "fetch: interceptor denied when host not in net permissions", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  // "external-api" exists on the network but the overlay grants NO net permissions,
  // so the interceptor's fetch() call should be rejected by the sandbox.
  const externalApi = await startWiremock({ network, alias: "external-api" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-fetch-denied.yaml",
      ],
      extraFiles: [
        { source: "interceptors/fetch-external.js", target: "/config/interceptors/fetch-external.js" },
      ],
    },
  });

  try {
    // The interceptor tries fetch("http://external-api:8080/token") but has no
    // net permissions. The gateway should return 500 (interceptor execution error).
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 500);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await externalApi.container.stop();
    await network.stop();
  }
});
