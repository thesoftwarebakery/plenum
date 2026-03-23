import { assert } from "@std/assert";
import { Network } from "testcontainers";
import { startWiremock } from "../src/containers/wiremock.ts";
import { startGateway } from "../src/containers/gateway.ts";

Deno.test({ name: "unmatched path returns error", sanitizeResources: false, sanitizeOps: false }, async () => {
  await using network = await new Network().start();
  await using _wiremock = await startWiremock({ network, alias: "wiremock" });
  await using gateway = await startGateway({ network });

  const resp = await fetch(`${gateway.baseUrl}/nonexistent`);
  assert(resp.status >= 400, `expected error status, got ${resp.status}`);
  await resp.body?.cancel();
});
