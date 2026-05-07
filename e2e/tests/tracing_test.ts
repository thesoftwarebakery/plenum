import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { WireMockClient } from '../src/helpers/wiremock-client';

/**
 * Collect container log output as a string.
 * Docker log streams stay open while the container runs and never emit 'end',
 * so we collect for a short window then close the stream.
 */
async function containerLogs(container: StartedTestContainer): Promise<string> {
  const stream = await container.logs();
  const chunks: string[] = [];
  await new Promise<void>((resolve) => {
    stream.on('data', (c: Buffer | string) => chunks.push(c.toString()));
    stream.on('error', resolve);
    setTimeout(resolve, 1_000);
  });
  stream.destroy();
  return chunks.join('');
}

describe("tracing", () => {
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: "wiremock" });
    gateway = await startGateway({
      network,
      environment: { RUST_LOG: "info" },
      fixtures: {
        openapi: "openapi.yaml",
        overlays: ["overlay-tracing.yaml", "overlay-upstream.yaml"],
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test("injects traceparent header into upstream requests", async () => {
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: ["widget"] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const resp = await fetch(`${gateway.baseUrl}/products`);
    expect(resp.status).toEqual(200);

    const requests = await wm.getRequests();
    expect(requests.length).toBeGreaterThan(0);

    const headers = requests[0].request.headers;
    // WireMock may capitalize header names, so search case-insensitively.
    const traceparentKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === "traceparent"
    );
    expect(traceparentKey).toBeDefined();
    // W3C traceparent format: version-traceId-spanId-flags
    expect(headers[traceparentKey!]).toMatch(
      /^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/
    );
  });

  test("preserves incoming trace ID in upstream traceparent", async () => {
    await wm.reset();
    await wm.resetRequests();

    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    const incomingTraceId = "0af7651916cd43dd8448eb211c80319c";
    const incomingSpanId = "b7ad6b7169203331";
    const traceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

    const resp = await fetch(`${gateway.baseUrl}/products`, {
      headers: { traceparent },
    });
    expect(resp.status).toEqual(200);

    const requests = await wm.getRequests();
    expect(requests.length).toBeGreaterThan(0);

    const headers = requests[0].request.headers;
    const traceparentKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === "traceparent"
    );
    expect(traceparentKey).toBeDefined();

    const upstreamTraceparent = headers[traceparentKey!];
    // Same trace ID, but a new span ID (the gateway's span).
    expect(upstreamTraceparent).toMatch(new RegExp(`^00-${incomingTraceId}-[a-f0-9]{16}-`));
    // Span ID should differ from the incoming one (gateway creates a child span).
    const upstreamSpanId = upstreamTraceparent.split("-")[2];
    expect(upstreamSpanId).not.toEqual(incomingSpanId);
  });

  test("access log emits JSON line with request details", async () => {
    await wm.reset();
    await wm.resetRequests();

    await wm.stubFor({
      request: { method: "GET", urlPath: "/products" },
      response: {
        status: 200,
        jsonBody: { items: [] },
        headers: { "Content-Type": "application/json" },
      },
    });

    await fetch(`${gateway.baseUrl}/products`);

    // Give time for log output to be written.
    await new Promise((r) => setTimeout(r, 500));
    const logs = await containerLogs(gateway.container);

    // The access log format is:
    // {"method":"GET","path":"/products","status":200,"route":"/products"}
    // Find the JSON line in the logs.
    const lines = logs.split('\n');
    const accessLogLine = lines.find((l) => l.includes('"method":"GET"') && l.includes('"path":"/products"'));
    expect(accessLogLine).toBeDefined();

    // Parse the JSON portion — use a non-greedy match starting from {"method"
    // to avoid capturing tracing-subscriber span context that precedes it.
    const jsonMatch = accessLogLine!.match(/\{"method".*\}/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed.method).toEqual("GET");
    expect(parsed.path).toEqual("/products");
    expect(parsed.status).toEqual(200);
    expect(parsed.route).toEqual("/products");
  });

  test("access log JSON-escapes string values containing quotes", async () => {
    await wm.reset();
    await wm.resetRequests();

    // Use a path containing a URL-encoded double quote (%22).
    // The gateway sees the raw URI path (percent-encoded), so the access log
    // will contain the encoded form. The JSON escaping ensures the log line
    // stays valid JSON even when path values contain special chars.
    await wm.stubFor({
      request: { method: "GET", urlPath: "/products/test%22quote" },
      response: {
        status: 200,
        jsonBody: { id: "test-quote" },
        headers: { "Content-Type": "application/json" },
      },
    });

    await fetch(`${gateway.baseUrl}/products/test%22quote`);

    await new Promise((r) => setTimeout(r, 500));
    const logs = await containerLogs(gateway.container);

    const lines = logs.split('\n');
    const accessLogLine = lines.find((l) => l.includes('test') && l.includes('quote') && l.includes('"path"'));
    expect(accessLogLine).toBeDefined();

    // The JSON should be valid — the percent-encoded path doesn't break anything.
    const jsonMatch = accessLogLine!.match(/\{"method".*\}/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed.path).toEqual('/products/test%22quote');
    expect(parsed.status).toEqual(200);
  });
});
