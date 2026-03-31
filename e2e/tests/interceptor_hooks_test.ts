import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

const INTERCEPTOR_OPENAPI = "openapi-interceptor.yaml";
const UPSTREAM_OVERLAY = "overlay-interceptor-upstream.yaml";

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

Deno.test({ name: "interceptor hooks", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await using network = await new Network().start();
  await using wiremock = await startWiremock({ network, alias: "wiremock" });
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-all-hooks.yaml"],
      extraFiles: [
        { source: "interceptors/all-hooks.js", target: "/config/interceptors/all-hooks.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  await wm.stubFor({
    request: { method: "GET", urlPath: "/products" },
    response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
  });

  await t.step("before_upstream adds header to upstream request", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected upstream to be called");
    const header = findHeader(requests[0].request.headers, "x-before-upstream");
    assertEquals(header, "fired");
  });

  await t.step("on_response adds header to client response", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    assertEquals(resp.headers.get("x-on-response"), "fired");
  });

  await t.step("all three hooks fire on a single request", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected upstream to be called");
    const upstreamHeaders = requests[0].request.headers;
    assertEquals(findHeader(upstreamHeaders, "x-on-request"), "fired");
    assertEquals(findHeader(upstreamHeaders, "x-before-upstream"), "fired");
    assertEquals(resp.headers.get("x-on-response"), "fired");
  });
});

Deno.test({ name: "on_response modifications", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await using network = await new Network().start();
  await using wiremock = await startWiremock({ network, alias: "wiremock" });
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-on-response-modify.yaml"],
      extraFiles: [
        { source: "interceptors/on-response-modify.js", target: "/config/interceptors/on-response-modify.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  await t.step("rewrites response status code", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 203);
    await resp.body?.cancel();
  });

  await t.step("adds and removes response headers", async () => {
    await wm.reset();
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: {},
        headers: { "Content-Type": "application/json", "x-remove-me": "present" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 203);
    await resp.body?.cancel();

    assertEquals(resp.headers.get("x-added-by-interceptor"), "yes");
    assertEquals(resp.headers.get("x-remove-me"), null);
  });
});

Deno.test({ name: "respond action ignored on committed phases", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await using network = await new Network().start();
  await using wiremock = await startWiremock({ network, alias: "wiremock" });
  await using gateway = await startGateway({
    network,
    fixtures: {
      openapi: INTERCEPTOR_OPENAPI,
      overlays: [UPSTREAM_OVERLAY, "overlay-interceptor-respond-ignored.yaml"],
      extraFiles: [
        { source: "interceptors/respond-ignored.js", target: "/config/interceptors/respond-ignored.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  await wm.stubFor({
    request: { method: "GET", urlPath: "/products" },
    response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
  });

  await t.step("before_upstream respond is ignored, request reaches upstream", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    assert(requests.length > 0, "expected upstream to be called");
  });

  await t.step("on_response respond is ignored, original status returned", async () => {
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    await resp.body?.cancel();
  });
});
