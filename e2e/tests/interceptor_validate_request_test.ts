import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

function postProductsStub() {
  return {
    request: { method: "POST", urlPath: "/products" },
    response: {
      status: 200,
      jsonBody: { created: true },
      headers: { "Content-Type": "application/json" },
    },
  };
}

Deno.test({ name: "validate-request: valid body passes through", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-validate-request.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor(postProductsStub());

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Widget" }),
    });
    assertEquals(resp.status, 200);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "validate-request: invalid body returns 400", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-validate-request.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor(postProductsStub());

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEquals(resp.status, 400);
    const body = await resp.json() as { type: string; errors?: unknown[] };
    assertEquals(body.type, "request-validation-error");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "validate-request: non-JSON body returns 400", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-validate-request.yaml",
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assertEquals(resp.status, 400);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
