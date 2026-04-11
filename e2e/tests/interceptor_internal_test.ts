import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "internal:add-header built-in injects configured header into upstream request", sanitizeResources: false, sanitizeOps: false }, async () => {
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
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    // Verify the upstream received the x-builtin header
    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const upstreamHeaders = requests[0].request.headers;
    // Wiremock may capitalize header names
    const headerKeys = Object.keys(upstreamHeaders);
    const builtinKey = headerKeys.find(k => k.toLowerCase() === "x-builtin");
    assert(builtinKey !== undefined, `expected x-builtin header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(upstreamHeaders[builtinKey!], "true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
