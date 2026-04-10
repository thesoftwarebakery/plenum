import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "interceptor receives options correctly", sanitizeResources: false, sanitizeOps: false }, async () => {
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
    assertEquals(resp1.status, 200);
    await resp1.body?.cancel();

    // Test with incorrect header - should get 403
    const resp2 = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-role": "user" }
    });
    assertEquals(resp2.status, 403);
    const body2 = await resp2.json() as { error: string };
    assertEquals(body2.error, "options check failed");
    
    // Verify upstream received the x-options-verified header (set by interceptor on the request)
    const requests = await wm.getRequests();
    assertEquals(requests.length, 1, "expected one request to upstream");
    const upstreamHeaders = requests[0].request.headers;
    const headerKeys = Object.keys(upstreamHeaders);
    const verifiedKey = headerKeys.find(k => k.toLowerCase() === "x-options-verified");
    assert(verifiedKey !== undefined, `expected x-options-verified header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(upstreamHeaders[verifiedKey!], "true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "interceptor receives no options (backward compat)", sanitizeResources: false, sanitizeOps: false }, async () => {
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
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    // Verify the upstream received the x-intercepted header
    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const upstreamHeaders = requests[0].request.headers;
    // Wiremock may capitalize header names
    const headerKeys = Object.keys(upstreamHeaders);
    const interceptedKey = headerKeys.find(k => k.toLowerCase() === "x-intercepted");
    assert(interceptedKey !== undefined, `expected x-intercepted header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(upstreamHeaders[interceptedKey!], "true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});