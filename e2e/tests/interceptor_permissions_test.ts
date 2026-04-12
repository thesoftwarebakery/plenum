import { assertEquals } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";

Deno.test({ name: "permissions: env access denied when not configured", sanitizeResources: false, sanitizeOps: false }, async () => {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: [
        "overlay-interceptor-upstream.yaml",
        "overlay-interceptor-permissions-denied.yaml",
      ],
      extraFiles: [
        { source: "interceptors/read-env.js", target: "/config/interceptors/read-env.js" },
      ],
    },
  });

  try {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    assertEquals(resp.status, 403);
    const body = await resp.json() as { error: string };
    assertEquals(typeof body.error, "string");
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
