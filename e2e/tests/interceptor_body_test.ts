import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

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

test("on_request reads body and modifies it based on content", async () => {
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
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected at least one request to upstream").toBe(true);
    const upstreamBody = JSON.parse(requests[0].request.body ?? "{}");
    expect(upstreamBody.name).toEqual("widget");
    expect(upstreamBody.flagged).toEqual(true);
    expect(upstreamBody.flagChecked, "interceptor should have added flagChecked:true when body.flagged is true").toEqual(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("on_request modifies request body before forwarding to upstream", async () => {
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
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected at least one request to upstream").toBe(true);
    const upstreamBody = JSON.parse(requests[0].request.body ?? "{}");
    expect(upstreamBody.name).toEqual("widget");
    expect(upstreamBody.intercepted, "upstream body should have intercepted:true added by interceptor").toEqual(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("on_request short-circuits with 403 based on body content", async () => {
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
    await wm.resetRequests();
    const resp = await fetch(`${gateway.baseUrl}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "widget", block: true }),
    });
    expect(resp.status).toEqual(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toEqual("blocked by body");

    const requests = await wm.getRequests();
    expect(requests.length, "expected no requests to upstream").toEqual(0);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

// -- Response body tests --

test("on_response_body modifies response body before forwarding to client", async () => {
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
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { items: string[]; intercepted?: boolean };
    expect(body.items).toEqual(["widget"]);
    expect(body.intercepted, "response body should have intercepted:true added by interceptor").toEqual(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
