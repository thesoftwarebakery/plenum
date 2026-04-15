import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

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

Deno.test({
  name: "response validation",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: BASE_FIXTURES,
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    // Plugin upstream tests
    await t.step("plugin: valid response passes through unchanged", async () => {
      const resp = await fetch(`${gateway.baseUrl}/plugin/valid`);
      assertEquals(resp.status, 200);
      const body = await resp.json() as { id: string; name: string };
      assertEquals(body.id, "1");
      assertEquals(body.name, "Widget");
    });

    await t.step("plugin: invalid response returns 502 with validation error", async () => {
      const resp = await fetch(`${gateway.baseUrl}/plugin/invalid`);
      assertEquals(resp.status, 502);
      const body = await resp.json() as { type: string; status: number };
      assertEquals(body.type, "response-validation-error");
      assertEquals(body.status, 502);
    });

    await t.step("plugin: no validation configured -- invalid response passes through", async () => {
      const resp = await fetch(`${gateway.baseUrl}/plugin/no-validation`);
      assertEquals(resp.status, 200);
      // Body passes through even though it's "invalid" by the /plugin/invalid schema
      // because no validate-response interceptor is configured on this route
      const body = await resp.json() as { wrong_field: string };
      assertEquals(body.wrong_field, "no id here");
    });

    // HTTP upstream tests
    await t.step("http: valid response passes through unchanged", async () => {
      await wm.stubFor({
        request: { method: "GET", urlPath: "/http/valid" },
        response: {
          status: 200,
          jsonBody: { id: "42", name: "Gadget" },
          headers: { "Content-Type": "application/json" },
        },
      });

      const resp = await fetch(`${gateway.baseUrl}/http/valid`);
      assertEquals(resp.status, 200);
      const body = await resp.json() as { id: string; name: string };
      assertEquals(body.id, "42");
      assertEquals(body.name, "Gadget");
    });

    await t.step("http: invalid response body is replaced with validation error", async () => {
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
      assertEquals(body.type, "response-validation-error");
      assertEquals(body.status, 502);
    });
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
