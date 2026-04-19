import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

const INTERCEPTOR_OPENAPI = "openapi-interceptor.yaml";
const UPSTREAM_OVERLAY = "overlay-interceptor-upstream.yaml";

test("on_request JS exception returns 500", async () => {
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
    expect(resp.status).toEqual(500);
    const body = await resp.json() as { error: string };
    expect(body.error.includes("interceptor error"), `expected "interceptor error" in body, got: ${JSON.stringify(body)}`).toBe(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("before_upstream and on_response errors are swallowed", async () => {
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
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    const requests = await wm.getRequests();
    expect(requests.length > 0, "expected upstream to be reached despite before_upstream error").toBe(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("on_request invalid return shape returns 500", async () => {
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
    expect(resp.status).toEqual(500);
    const body = await resp.json() as { error: string };
    expect(body.error.includes("interceptor error"), `expected "interceptor error" in body, got: ${JSON.stringify(body)}`).toBe(true);
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("before_upstream and on_response invalid returns are swallowed", async () => {
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
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
