import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

// With Node.js, env var enforcement is at-spawn-time filtering (not a runtime exception).
// When SECRET_VALUE is not in permissions.env, it is simply absent from the process
// environment.  The interceptor receives undefined → returns "not-set" as a header
// forwarded to the upstream request.
test("permissions: env var not available when not in allowlist", async () => {
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
  const wm = new WireMockClient(wiremock.adminUrl);

  try {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: { status: 200, jsonBody: {}, headers: { "Content-Type": "application/json" } },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    await resp.body?.cancel();

    // The on_request interceptor adds x-env-value to the upstream request headers.
    // Since SECRET_VALUE is not set in the gateway environment, the value is "not-set".
    const requests = await wm.getRequests();
    expect(requests.length, 'expected at least one upstream request').toBeGreaterThan(0);
    const upstreamHeaders = requests[0].request.headers;
    const headerKeys = Object.keys(upstreamHeaders);
    const envKey = headerKeys.find((k) => k.toLowerCase() === 'x-env-value');
    expect(envKey, 'expected x-env-value header forwarded to upstream').toBeDefined();
    expect(upstreamHeaders[envKey!]).toEqual('not-set');
  } finally {
    await gateway.container.stop();
    await wiremock.container.stop();
    await network.stop();
  }
});
