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

  test("queryParams: no query string yields empty object", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.queryParams).toEqual({});
  });

  test("queryParams: string parameter parsed correctly", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?message=hello`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.message).toEqual("hello");
  });

  test("queryParams: integer parameter coerced to number", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?count=42`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.count).toEqual(42);
    expect(typeof qp.count).toEqual("number");
  });

  test("queryParams: boolean parameter coerced to bool", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?active=true`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.active).toEqual(true);
    expect(typeof qp.active).toEqual("boolean");
  });

  test("queryParams: form+explode=true array (?tags=a&tags=b)", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?tags=red&tags=blue`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.tags).toEqual(["red", "blue"]);
  });

  test("queryParams: form+explode=false array (?csv=a,b,c)", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?csv=a,b,c`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.csv).toEqual(["a", "b", "c"]);
  });

  test("queryParams: spaceDelimited array (?spaced=a%20b%20c)", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?spaced=a%20b%20c`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.spaced).toEqual(["a", "b", "c"]);
  });

  test("queryParams: pipeDelimited array (?piped=a|b|c)", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?piped=a%7Cb%7Cc`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.piped).toEqual(["a", "b", "c"]);
  });

  test("queryParams: deepObject (?filter[name]=alice&filter[age]=30)", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?filter%5Bname%5D=alice&filter%5Bage%5D=30`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.filter).toEqual({ name: "alice", age: "30" });
  });

  test("queryParams: undeclared params included as raw strings", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo?undeclared=value`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as Record<string, unknown>;
    const qp = body.queryParams as Record<string, unknown>;
    expect(qp.undeclared).toEqual("value");
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
