import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway, GatewayContainer } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

// Permutation 1: buffer-response false (default), no on_response_body interceptor
// Streams through; Content-Length is preserved.
Deno.test({ name: "buffer-response default (false): Content-Length preserved when streaming", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    const responseBody = JSON.stringify({ items: ["widget"] });
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        body: responseBody,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(new TextEncoder().encode(responseBody).length),
        },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);

    const contentLength = resp.headers.get("content-length");
    assert(contentLength !== null, "Content-Length should be present when streaming (no buffering)");

    const body = await resp.json() as { items: string[] };
    assertEquals(body.items, ["widget"]);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// Permutation 2: buffer-response false (default), on_response_body interceptor configured
// Gateway should refuse to start (boot-time validation failure).
// (Permutation 3: buffer-response true + on_response_body is covered by interceptor_body_test.ts)
Deno.test({ name: "buffer-response default (false) with on_response_body: gateway refuses to start", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });

  let gateway: GatewayContainer | null = null;
  let threw = false;
  try {
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-interceptor-body.yaml",
        overlays: [
          "overlay-interceptor-body-upstream.yaml",
          "overlay-interceptor-modify-response-body.yaml",
        ],
        extraFiles: [
          { source: "interceptors/modify-response-body.js", target: "/config/interceptors/modify-response-body.js" },
        ],
      },
    });
  } catch (_e) {
    threw = true;
  }

  try {
    assert(threw, "gateway should have failed to start when on_response_body is configured without buffer-response: true");
  } finally {
    if (gateway) await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// Permutation 4: buffer-response true, no on_response_body interceptor
// Buffers; Content-Length is stripped (even though body is unchanged).
Deno.test({ name: "buffer-response true (no interceptor): Content-Length stripped after buffering", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-body-upstream-buffered.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    const responseBody = JSON.stringify({ items: ["widget"] });
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        body: responseBody,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(new TextEncoder().encode(responseBody).length),
        },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);

    const contentLength = resp.headers.get("content-length");
    assertEquals(contentLength, null, "Content-Length should be stripped when buffer-response is true");

    const body = await resp.json() as { items: string[] };
    assertEquals(body.items, ["widget"], "response body should be unchanged");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
