import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

test("ctx written in on_request is readable in on_response", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-ctx.yaml",
      overlays: ["overlay-ctx.yaml"],
      extraFiles: [
        { source: "interceptors/set-ctx.js", target: "/config/interceptors/set-ctx.js" },
        { source: "interceptors/read-ctx.js", target: "/config/interceptors/read-ctx.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-user-tier": "gold" },
    });
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    // ctx.userTier written by on_request interceptor, echoed back by on_response interceptor
    expect(resp.headers.get("x-ctx-user-tier")).toEqual("gold");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("ctx.gateway.route and ctx.gateway.method are populated", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-ctx.yaml",
      overlays: ["overlay-ctx.yaml"],
      extraFiles: [
        { source: "interceptors/set-ctx.js", target: "/config/interceptors/set-ctx.js" },
        { source: "interceptors/read-ctx.js", target: "/config/interceptors/read-ctx.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { "x-user-tier": "silver" },
    });
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    // set-ctx.js reads ctx.gateway and stashes values in user ctx.
    // read-ctx.js echoes them back as response headers.
    expect(resp.headers.get("x-ctx-gateway-route")).toEqual("/products");
    expect(resp.headers.get("x-ctx-gateway-method")).toEqual("GET");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("ctx is empty for interceptor with no prior ctx modifications", async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-ctx.yaml",
      overlays: ["overlay-ctx.yaml"],
      extraFiles: [
        { source: "interceptors/set-ctx.js", target: "/config/interceptors/set-ctx.js" },
        { source: "interceptors/read-ctx.js", target: "/config/interceptors/read-ctx.js" },
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    // No x-user-tier header — set-ctx.js stashes "unknown"
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    expect(resp.headers.get("x-ctx-user-tier")).toEqual("unknown");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
