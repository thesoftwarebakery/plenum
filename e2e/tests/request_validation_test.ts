import { assertEquals, assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "request validation", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-validation.yaml",
      overlays: [
        "overlay-upstream-validation.yaml",
        "overlay-validation-interceptors.yaml",
      ],
    },
  });
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await t.step("valid POST body is proxied to upstream", async () => {
      await wm.stubFor({
        request: { method: "POST", urlPath: "/items" },
        response: {
          status: 201,
          jsonBody: { id: "123", name: "Widget" },
          headers: { "Content-Type": "application/json" },
        },
      });

      const resp = await fetch(`${gateway.baseUrl}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Widget", quantity: 5 }),
      });
      assertEquals(resp.status, 201);
      const body = await resp.json() as { id: string; name: string };
      assertEquals(body.id, "123");
    });

    await t.step("invalid POST body returns 400", async () => {
      const resp = await fetch(`${gateway.baseUrl}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Widget" }), // missing required 'quantity'
      });
      assertEquals(resp.status, 400);
      const body = await resp.json() as { type: string; errors: Array<{ path: string; message: string }> };
      assertEquals(body.type, "request-validation-error");
      assert(body.errors.length > 0);
    });

    await t.step("non-JSON POST body returns 400", async () => {
      const resp = await fetch(`${gateway.baseUrl}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      assertEquals(resp.status, 400);
      const body = await resp.json() as { type: string };
      assertEquals(body.type, "request-validation-error");
    });

    await t.step("GET with no body is not validated and proxies normally", async () => {
      await wm.stubFor({
        request: { method: "GET", urlPath: "/items" },
        response: {
          status: 200,
          jsonBody: { items: [] },
          headers: { "Content-Type": "application/json" },
        },
      });

      const resp = await fetch(`${gateway.baseUrl}/items`);
      assertEquals(resp.status, 200);
      await resp.body?.cancel();
    });
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
