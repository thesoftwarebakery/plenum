import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "two on_request interceptors both fire in order", sanitizeResources: false, sanitizeOps: false }, async () => {
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
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const headers = requests[0].request.headers;
    const headerKeys = Object.keys(headers);

    const firstKey = headerKeys.find(k => k.toLowerCase() === "x-chain-first");
    assert(firstKey !== undefined, `expected x-chain-first header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(headers[firstKey!], "true");

    const secondKey = headerKeys.find(k => k.toLowerCase() === "x-chain-second");
    assert(secondKey !== undefined, `expected x-chain-second header in upstream request, got: ${headerKeys.join(", ")}`);
    assertEquals(headers[secondKey!], "true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
