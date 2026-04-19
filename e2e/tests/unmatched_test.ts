import { test, expect } from 'vitest';
import { Network } from 'testcontainers';
import { startWiremock } from '../src/containers/wiremock';
import { startGateway } from '../src/containers/gateway';

test("unmatched path returns error", async () => {
  const network = await new Network().start();
  const _wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({ network });

  try {
    const resp = await fetch(`${gateway.baseUrl}/nonexistent`);
    expect(resp.status >= 400, `expected error status, got ${resp.status}`).toBe(true);
    await resp.body?.cancel();
  } finally {
    await gateway.container.stop();
    await _wiremock.container.stop();
    await network.stop();
  }
});
