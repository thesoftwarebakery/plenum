import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

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

test("validate-request: valid body passes through", async () => {
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
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("validate-request: invalid body returns 400", async () => {
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
    expect(resp.status).toEqual(400);
    const body = await resp.json() as { type: string; errors?: unknown[] };
    expect(body.type).toEqual("request-validation-error");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});

test("validate-request: non-JSON body returns 400", async () => {
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
    expect(resp.status).toEqual(400);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
