import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

const INTERCEPTOR_OPENAPI = "openapi-interceptor.yaml";
const UPSTREAM_OVERLAY = "overlay-interceptor-upstream.yaml";

Deno.test({ name: "on_request JS exception returns 500", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-throw-on-request.yaml"],
      extraFiles: [
        { source: "interceptors/throw-error.js", target: "/config/interceptors/throw-error.js" },
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 500);
    const body = await resp.json() as { error: string };
    assert(body.error.includes("interceptor error"), `expected "interceptor error" in body, got: ${JSON.stringify(body)}`);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "before_upstream and on_response errors are swallowed", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-throw-nonfatal.yaml"],
      extraFiles: [
        { source: "interceptors/throw-error.js", target: "/config/interceptors/throw-error.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: { ok: true }, headers: { "Content-Type": "application/json" } },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected upstream to be reached despite before_upstream error");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "on_request invalid return shape returns 500", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-invalid-on-request.yaml"],
      extraFiles: [
        { source: "interceptors/invalid-return.js", target: "/config/interceptors/invalid-return.js" },
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 500);
    const body = await resp.json() as { error: string };
    assert(body.error.includes("interceptor error"), `expected "interceptor error" in body, got: ${JSON.stringify(body)}`);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "before_upstream and on_response invalid returns are swallowed", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-invalid-nonfatal.yaml"],
      extraFiles: [
        { source: "interceptors/invalid-return.js", target: "/config/interceptors/invalid-return.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "sandbox prevents network access", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-sandbox.yaml"],
      extraFiles: [
        { source: "interceptors/sandbox-escape.js", target: "/config/interceptors/sandbox-escape.js" },
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 500);
    const body = await resp.json() as { error: string };
    assert(body.error.includes("interceptor error"), `expected "interceptor error" in body, got: ${JSON.stringify(body)}`);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
