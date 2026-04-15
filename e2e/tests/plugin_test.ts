import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startGateway } from "../src/containers/gateway.ts";

const BASE_FIXTURES = {
  openapi: "openapi-plugin.yaml",
  overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream.yaml"],
  extraFiles: [
    { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
  ],
};

Deno.test({
  name: "plugin upstream: basic tests",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  await using network = await new Network().start();
  await using gateway = await startGateway({
    network,
    fixtures: BASE_FIXTURES,
  });

  await t.step("GET /echo returns plugin response", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    assertEquals(body.method, "GET");
    assertEquals(body.path, "/echo");
  });

  await t.step("GET /echo/{id} passes path params to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo/42`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    const params = body.params as Record<string, string>;
    assertEquals(params.id, "42");
    assertEquals(body.path, "/echo/42");
  });

  await t.step("GET /echo passes backend config to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    const config = body.config as Record<string, unknown>;
    assertEquals(config.operation, "listEcho");
  });

  await t.step("POST /echo passes request body to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    const requestBody = body.requestBody as Record<string, unknown>;
    assertEquals(requestBody.name, "Alice");
  });

  await t.step("GET /echo passes operation metadata to plugin", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    const operation = body.operation as Record<string, unknown>;
    assertEquals(operation.operationId, "echoGet");
    assertEquals(operation.summary, "Echo a GET request");
    assert(operation.responses !== undefined, "operation.responses should be present");
  });

  await t.step("GET /echo/{id} passes parameters in operation metadata", async () => {
    const resp = await fetch(`${gateway.baseUrl}/echo/42`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    const operation = body.operation as Record<string, unknown>;
    assertEquals(operation.operationId, "echoById");
    const parameters = operation.parameters as Array<Record<string, unknown>>;
    assert(Array.isArray(parameters), "operation.parameters should be an array");
    assertEquals(parameters.length, 1);
    assertEquals(parameters[0].name, "id");
    assertEquals(parameters[0].in, "path");
  });
});

Deno.test({
  name: "plugin upstream: on_request interceptor runs before plugin",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  await using network = await new Network().start();
  await using gateway = await startGateway({
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

  const resp = await fetch(`${gateway.baseUrl}/echo`);
  assertEquals(resp.status, 200);
  const body = await resp.json() as Record<string, unknown>;
  const headers = body.headers as Record<string, string>;
  const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
  assert(
    headerKeys.includes("x-intercepted"),
    `expected x-intercepted header in plugin input, got: ${headerKeys.join(", ")}`,
  );
  const interceptedValue = headers[
    Object.keys(headers).find((k) => k.toLowerCase() === "x-intercepted")!
  ];
  assertEquals(interceptedValue, "true");
});
