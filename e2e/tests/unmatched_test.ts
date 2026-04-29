import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';

test("unmatched path returns 404", async () => {
  const network = await new Network().start();
  const _wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({ network });

  try {
    const resp = await fetch(`${gateway.baseUrl}/nonexistent`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toBe("no matching route");
  } finally {
    await gateway.container.stop();
    await _wiremock.container.stop();
    await network.stop();
  }
});
