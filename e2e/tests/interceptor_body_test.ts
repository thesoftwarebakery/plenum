import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

const BODY_FIXTURES: { source: string; target: string }[] = [
  { source: "interceptors/read-request-body.js", target: "/config/interceptors/read-request-body.js" },
  { source: "interceptors/modify-request-body.js", target: "/config/interceptors/modify-request-body.js" },
  { source: "interceptors/block-by-body.js", target: "/config/interceptors/block-by-body.js" },
  { source: "interceptors/modify-response-body.js", target: "/config/interceptors/modify-response-body.js" },
];

function postStub() {
  return {
    request: { method: "POST", urlPath: "/products" },
    response: {
      status: 200,
      jsonBody: { created: true },
      headers: { "Content-Type": "application/json" },
    },
  };
}

// -- Request body tests --

Deno.test({ name: "on_request reads body and modifies it based on content", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-body-upstream.yaml",
        "overlay-interceptor-read-request-body.yaml",
      ],
      extraFiles: BODY_FIXTURES,
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor(postStub());

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "widget", flagged: true }),
    });
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const upstreamBody = JSON.parse(requests[0].request.body ?? "{}");
    assertEquals(upstreamBody.name, "widget");
    assertEquals(upstreamBody.flagged, true);
    assertEquals(upstreamBody.flagChecked, true, "interceptor should have added flagChecked:true when body.flagged is true");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "on_request modifies request body before forwarding to upstream", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-body-upstream.yaml",
        "overlay-interceptor-modify-request-body.yaml",
      ],
      extraFiles: BODY_FIXTURES,
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor(postStub());

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "widget" }),
    });
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected at least one request to upstream");
    const upstreamBody = JSON.parse(requests[0].request.body ?? "{}");
    assertEquals(upstreamBody.name, "widget");
    assertEquals(upstreamBody.intercepted, true, "upstream body should have intercepted:true added by interceptor");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

Deno.test({ name: "on_request short-circuits with 403 based on body content", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-body-upstream.yaml",
        "overlay-interceptor-block-by-body.yaml",
      ],
      extraFiles: BODY_FIXTURES,
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "widget", block: true }),
    });
    assertEquals(resp.status, 403);
    const body = await resp.json() as { error: string };
    assertEquals(body.error, "blocked by body");

    const requests = await wm.getRequests();
    assertEquals(requests.length, 0, "expected no requests to upstream");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// -- Response body tests --

Deno.test({ name: "on_response_body modifies response body before forwarding to client", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor-body.yaml",
      overlays: [
        "overlay-interceptor-body-upstream-buffered.yaml",
        "overlay-interceptor-modify-response-body.yaml",
      ],
      extraFiles: BODY_FIXTURES,
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
    const body = await resp.json() as { items: string[]; intercepted?: boolean };
    assertEquals(body.items, ["widget"]);
    assertEquals(body.intercepted, true, "response body should have intercepted:true added by interceptor");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
