import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

function getProductsStub() {
  return {
    request: { method: "GET", urlPath: "/products" },
    response: {
      status: 200,
      jsonBody: { items: ["widget"] },
      headers: { "Content-Type": "application/json" },
    },
  };
}

Deno.test({ name: "auth-apikey: correct key passes through", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    environment: { API_KEY: "test-secret-key" },
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-auth-apikey.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor(getProductsStub());

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-api-key": "test-secret-key" },
    });
    assertEquals(resp.status, 200);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "auth-apikey: wrong key returns 401", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    environment: { API_KEY: "test-secret-key" },
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-auth-apikey.yaml",
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-api-key": "wrong" },
    });
    assertEquals(resp.status, 401);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "auth-apikey: missing key returns 401", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    environment: { API_KEY: "test-secret-key" },
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-auth-apikey.yaml",
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 401);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
