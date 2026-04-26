import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

/**
 * Helper: stub each wiremock to respond with a unique server identifier
 * and a health endpoint.
 */
async function stubUpstream(wm: WireMockClient, serverId: string) {
  await wm.stubFor({
    request: { method: "GET", urlPath: "/products" },
    response: {
      status: 200,
      jsonBody: { server: serverId },
      headers: { "Content-Type": "application/json" },
    },
  });
  // Health endpoint — wiremock admin /health is used in the overlay.
  // The overlay uses /__admin/health which wiremock serves by default.
}

/**
 * Send N requests and collect the server IDs from responses.
 * Returns a map of serverId → count.
 */
async function sendRequests(
  baseUrl: string,
  n: number,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const resp = await fetch(`${baseUrl}/products`);
    if (resp.ok) {
      const body = await resp.json() as { server: string };
      counts.set(body.server, (counts.get(body.server) ?? 0) + 1);
    } else {
      errors++;
      if (errors <= 3) {
        const text = await resp.text();
        console.warn(`Request ${i} failed: ${resp.status} ${text.slice(0, 200)}`);
      }
    }
  }
  if (errors > 0) {
    console.warn(`Total errors: ${errors}/${n}`);
  }
  return counts;
}

/**
 * Wait until a condition is met, with polling.
 */
async function waitFor(
  conditionFn: () => Promise<boolean>,
  timeoutMs: number = 15000,
  intervalMs: number = 500,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe("load balancing — round-robin", () => {
  let network: StartedNetwork;
  let wm1Container: WiremockContainer;
  let wm2Container: WiremockContainer;
  let wm3Container: WiremockContainer;
  let gateway: GatewayContainer;
  let wm1: WireMockClient;
  let wm2: WireMockClient;
  let wm3: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    [wm1Container, wm2Container, wm3Container] = await Promise.all([
      startWiremock({ network, alias: "upstream-1" }),
      startWiremock({ network, alias: "upstream-2" }),
      startWiremock({ network, alias: "upstream-3" }),
    ]);
    wm1 = new WireMockClient(wm1Container.adminUrl);
    wm2 = new WireMockClient(wm2Container.adminUrl);
    wm3 = new WireMockClient(wm3Container.adminUrl);

    await Promise.all([
      stubUpstream(wm1, "1"),
      stubUpstream(wm2, "2"),
      stubUpstream(wm3, "3"),
    ]);

    gateway = await startGateway({
      network,
      fixtures: {
        overlays: ["overlay-gateway.yaml", "overlay-load-balancing.yaml"],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wm1Container?.container.stop();
    await wm2Container?.container.stop();
    await wm3Container?.container.stop();
    await network?.stop();
  });

  test("distributes requests across all backends", async () => {
    const counts = await sendRequests(gateway.baseUrl, 30);

    // All 3 servers should have received at least some traffic
    expect(counts.size).toBe(3);
    expect(counts.get("1")).toBeGreaterThan(0);
    expect(counts.get("2")).toBeGreaterThan(0);
    expect(counts.get("3")).toBeGreaterThan(0);
  });

  test("fails over when a backend goes down", async () => {
    // Stop upstream-2
    await wm2Container.container.stop();

    // Wait for the health check to detect the failure
    // (interval 2s, consecutive-failure 2, so ~4s max)
    await new Promise(r => setTimeout(r, 6000));

    // Reset request logs on surviving upstreams
    await wm1.resetRequests();
    await wm3.resetRequests();

    // Send requests — should go only to 1 and 3
    const counts = await sendRequests(gateway.baseUrl, 20);

    // Only servers 1 and 3 should have received traffic
    expect(counts.has("2")).toBe(false);
    expect(counts.get("1")).toBeGreaterThan(0);
    expect(counts.get("3")).toBeGreaterThan(0);
  });

  test("rebalances when a backend recovers", async () => {
    // Restart upstream-2
    wm2Container = await startWiremock({ network, alias: "upstream-2" });
    wm2 = new WireMockClient(wm2Container.adminUrl);
    await stubUpstream(wm2, "2");

    // Wait for health check to detect recovery
    // (interval 2s, consecutive-success 1, so ~2-4s)
    await waitFor(async () => {
      const counts = await sendRequests(gateway.baseUrl, 15);
      return counts.has("2");
    }, 15000, 2000);

    // Now verify traffic goes to all 3
    const counts = await sendRequests(gateway.baseUrl, 30);
    expect(counts.get("1")).toBeGreaterThan(0);
    expect(counts.get("2")).toBeGreaterThan(0);
    expect(counts.get("3")).toBeGreaterThan(0);
  });
});

describe("load balancing — weighted", () => {
  let network: StartedNetwork;
  let wm1Container: WiremockContainer;
  let wm2Container: WiremockContainer;
  let wm3Container: WiremockContainer;
  let gateway: GatewayContainer;
  let wm1: WireMockClient;
  let wm2: WireMockClient;
  let wm3: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    [wm1Container, wm2Container, wm3Container] = await Promise.all([
      startWiremock({ network, alias: "upstream-1" }),
      startWiremock({ network, alias: "upstream-2" }),
      startWiremock({ network, alias: "upstream-3" }),
    ]);
    wm1 = new WireMockClient(wm1Container.adminUrl);
    wm2 = new WireMockClient(wm2Container.adminUrl);
    wm3 = new WireMockClient(wm3Container.adminUrl);

    await Promise.all([
      stubUpstream(wm1, "1"),
      stubUpstream(wm2, "2"),
      stubUpstream(wm3, "3"),
    ]);

    gateway = await startGateway({
      network,
      fixtures: {
        overlays: ["overlay-gateway.yaml", "overlay-load-balancing-weighted.yaml"],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wm1Container?.container.stop();
    await wm2Container?.container.stop();
    await wm3Container?.container.stop();
    await network?.stop();
  });

  test("distributes requests according to weights", async () => {
    // Weights: upstream-1=5, upstream-2=3, upstream-3=2 (total 10)
    const counts = await sendRequests(gateway.baseUrl, 100);

    // All 3 should receive traffic
    expect(counts.size).toBe(3);
    const c1 = counts.get("1") ?? 0;
    const c2 = counts.get("2") ?? 0;
    const c3 = counts.get("3") ?? 0;

    // Server 1 (weight 5) should get more than server 3 (weight 2)
    expect(c1).toBeGreaterThan(c3);
    // Server 2 (weight 3) should get more than server 3 (weight 2)
    expect(c2).toBeGreaterThan(c3);
  });
});

describe("load balancing — single upstream unchanged", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    wm = new WireMockClient(wiremock.adminUrl);

    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    // Uses the standard single-upstream overlay
    gateway = await startGateway({ network });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("single upstream still works without LB overhead", async () => {
    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);
    const body = await resp.json() as { items: string[] };
    expect(body.items).toEqual(["widget"]);
  });
});
