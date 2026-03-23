import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

Deno.test({ name: "proxy", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await using network = await new Network().start();
  await using wiremock = await startWiremock({ network, alias: "wiremock" });
  await using gateway = await startGateway({ network });
  const wm = new WireMockClient(wiremock.adminUrl);

  await t.step("proxies GET /products to upstream", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as { items: string[] };
    assertEquals(body.items, ["widget"]);
  });

  await t.step("proxies parameterised path /products/{id}", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products/abc-123" },
      response: {
        status: 200,
        jsonBody: { id: "abc-123" },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products/abc-123`);
    assertEquals(resp.status, 200);
    const body = await resp.json() as { id: string };
    assertEquals(body.id, "abc-123");
  });
});
