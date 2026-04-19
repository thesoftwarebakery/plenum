import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';

const BASE_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream.yaml"],
  extraFiles: [
    { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
  ],
};

describe("plugin upstream: basic tests", () => {
  let network: StartedNetwork;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    network = await new Network().start();
    gateway = await startGateway({
      network,
      fixtures: BASE_FIXTURES,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await network?.stop();
  });

  test("GET /echo returns plugin response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.method).toEqual("GET");
    expect(body.path).toEqual("/echo");
  });

  test("GET /echo/{id} passes path params to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo/42`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const params = body.params as Record<string, string>;
    expect(params.id).toEqual("42");
    expect(body.path).toEqual("/echo/42");
  });

  test("GET /echo passes backend config to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const config = body.config as Record<string, unknown>;
    expect(config.table).toEqual("echo");
    expect(config.query).toEqual("list");
  });

  test("POST /echo passes request body to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const requestBody = body.requestBody as Record<string, unknown>;
    expect(requestBody.name).toEqual("Alice");
  });

  test("GET /echo passes operation metadata to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const operation = body.operation as Record<string, unknown>;
    expect(operation.operationId).toEqual("echoGet");
    expect(operation.summary).toEqual("Echo a GET request");
    expect(operation.responses !== undefined, "operation.responses should be present").toBe(true);
  });

  test("GET /echo/{id} passes parameters in operation metadata", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo/42`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const operation = body.operation as Record<string, unknown>;
    expect(operation.operationId).toEqual("echoById");
    const parameters = operation.parameters as Array<Record<string, unknown>>;
    expect(Array.isArray(parameters), "operation.parameters should be an array").toBe(true);
    expect(parameters.length).toEqual(1);
    expect(parameters[0].name).toEqual("id");
    expect(parameters[0].in).toEqual("path");
  });
});

test("plugin upstream: on_request interceptor runs before plugin", async () => {
  const network = await new Network().start();
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-plugin.yaml",
      overlays: [
        "overlay-plugin-gateway.yaml",
        "overlay-plugin-upstream.yaml",
        "overlay-plugin-interceptor.yaml",
      ],
      extraFiles: [
        { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const headers = body.headers as Record<string, string>;
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(
      headerKeys.includes("x-intercepted"),
      `expected x-intercepted header in plugin input, got: ${headerKeys.join(", ")}`,
    ).toBe(true);
    const interceptedValue = headers[
      Object.keys(headers).find((k) => k.toLowerCase() === "x-intercepted")!
    ];
    expect(interceptedValue).toEqual("true");
  } finally {
    await gateway.container.stop();
    await network.stop();
  }
});
