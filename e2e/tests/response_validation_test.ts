import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

const BASE_FIXTURES = {
  openapi: "openapi-response-validation.yaml",
  overlays: ["overlay-response-validation.yaml"],
  extraFiles: [
    {
      source: "plugins/response-validation-test.js",
      target: "/config/plugins/response-validation-test.js",
    },
  ],
};

describe("response validation", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      fixtures: BASE_FIXTURES,
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  // Plugin upstream tests
  test("plugin: valid response passes through unchanged", async () => {
    const resp = await fetch(`${gateway.baseUrl}/plugin/valid`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { id: string; name: string };
    expect(body.id).toEqual("1");
    expect(body.name).toEqual("Widget");
  });

  test("plugin: invalid response returns 502 with validation error", async () => {
    const resp = await fetch(`${gateway.baseUrl}/plugin/invalid`);
    expect(resp.status).toEqual(502);
    const body = await resp.json() as { type: string; status: number };
    expect(body.type).toEqual("response-validation-error");
    expect(body.status).toEqual(502);
  });

  test("plugin: no validation configured -- invalid response passes through", async () => {
    const resp = await fetch(`${gateway.baseUrl}/plugin/no-validation`);
    expect(resp.status).toEqual(200);
    // Body passes through even though it's "invalid" by the /plugin/invalid schema
    // because no validate-response interceptor is configured on this route
    const body = await resp.json() as { wrong_field: string };
    expect(body.wrong_field).toEqual("no id here");
  });

  // HTTP upstream tests
  test("http: valid response passes through unchanged", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/http/valid" },
      response: {
        status: 200,
        jsonBody: { id: "42", name: "Gadget" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/http/valid`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { id: string; name: string };
    expect(body.id).toEqual("42");
    expect(body.name).toEqual("Gadget");
  });

  test("http: invalid response body is replaced with validation error", async () => {
    await wm.resetRequests();
    await wm.stubFor({
      request: { method: "GET", urlPath: "/http/invalid" },
      response: {
        status: 200,
        jsonBody: { wrong_field: "no id here" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/http/invalid`);
    // For HTTP upstreams, the status code is already committed before body validation,
    // so the status may remain 200, but the body is replaced with the error.
    const body = await resp.json() as { type: string; status: number };
    expect(body.type).toEqual("response-validation-error");
    expect(body.status).toEqual(502);
  });
});
