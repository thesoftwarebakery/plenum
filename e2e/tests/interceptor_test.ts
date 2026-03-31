import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "on_request interceptor adds header", sanitizeResources: false, sanitizeOps: false }, async () => {
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

Deno.test({ name: "on_request interceptor short-circuits with 403", sanitizeResources: false, sanitizeOps: false }, async () => {
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
    assertEquals(resp.status, 403);
    const body = await resp.json() as { error: string };
    assertEquals(body.error, "blocked by interceptor");

    // Verify upstream was NOT called
    const requests = await wm.getRequests();
    assertEquals(requests.length, 0, "expected no requests to upstream");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
