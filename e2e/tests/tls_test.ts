/**
 * TLS e2e tests.
 *
 * Covers:
 *  1. HTTPS listener → plain HTTP upstream (gateway terminates TLS)
 *  2. Plain HTTP listener → HTTPS upstream (verified against test CA)
 *  3. Full TLS chain (HTTPS in + HTTPS out)
 *  4. tls-verify: false allows connection to unverified upstream + warns in logs
 *  5. Upstream cert not in trust store → 502
 */
import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Network, type StartedNetwork, type StartedTestContainer } from 'testcontainers';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { getTestCerts, type TestCerts } from '../src/certs';
import { startGateway, type GatewayContainer } from '../src/containers/gateway';
import { startWiremock, type WiremockContainer } from '../src/containers/wiremock';
import { startHttpsUpstream, type HttpsUpstreamContainer } from '../src/containers/https-upstream';
import { WireMockClient } from '../src/helpers/wiremock-client';

// ---------------------------------------------------------------------------
// HTTPS client helper
// ---------------------------------------------------------------------------

/** Make an HTTPS GET request using a custom CA cert. */
function httpsGet(url: string, caPath: string): Promise<{ status: number; body: string }> {
  const ca = readFileSync(caPath);
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ca }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Collect container log output as a string.
 * Docker log streams stay open while the container runs and never emit 'end',
 * so we collect for a short window then close the stream. Startup logs (including
 * the TLS verification warning) are already buffered by the time the gateway is
 * ready, so they arrive in the first data events.
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

// ---------------------------------------------------------------------------
// Test 1: HTTPS listener → plain HTTP upstream
// ---------------------------------------------------------------------------

describe('TLS listener: terminates HTTPS, proxies to plain upstream', () => {
  let certs: TestCerts;
  let network: StartedNetwork;
  let wiremock: WiremockContainer;
  let gateway: GatewayContainer;
  let wm: WireMockClient;

  beforeAll(async () => {
    certs = getTestCerts();
    network = await new Network().start();
    wiremock = await startWiremock({ network, alias: 'wiremock' });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: 'openapi-tls.yaml',
        overlays: ['overlay-tls-gateway.yaml', 'overlay-tls-gateway-listener.yaml', 'overlay-tls-upstream-plain.yaml'],
      },
      tls: {
        certPath: certs.gateway.crt,
        keyPath: certs.gateway.key,
      },
    });
    wm = new WireMockClient(wiremock.adminUrl);
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await wiremock?.container.stop();
    await network?.stop();
  });

  test('client connects via HTTPS and receives proxied response', async () => {
    await wm.stubFor({
      request: { method: 'GET', urlPath: '/proxy' },
      response: { status: 200, jsonBody: { ok: true }, headers: { 'Content-Type': 'application/json' } },
    });

    const result = await httpsGet(`${gateway.httpsBaseUrl}/proxy`, certs.ca.crt);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Test 2: Plain listener → HTTPS upstream (verified)
// ---------------------------------------------------------------------------

describe('HTTPS upstream: verified against test CA', () => {
  let certs: TestCerts;
  let network: StartedNetwork;
  let upstream: HttpsUpstreamContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    certs = getTestCerts();
    network = await new Network().start();
    upstream = await startHttpsUpstream({ network, certs });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: 'openapi-tls.yaml',
        overlays: ['overlay-tls-gateway.yaml', 'overlay-tls-gateway-ca.yaml', 'overlay-tls-upstream-https.yaml'],
      },
      caPath: certs.ca.crt,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await upstream?.container.stop();
    await network?.stop();
  });

  test('gateway connects to HTTPS upstream with cert verification enabled', async () => {
    const resp = await fetch(`${gateway.baseUrl}/proxy`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as { path: string; method: string };
    expect(body.path).toBe('/proxy');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Full TLS chain (HTTPS in + HTTPS out)
// ---------------------------------------------------------------------------

describe('Full TLS chain: HTTPS listener + HTTPS upstream', () => {
  let certs: TestCerts;
  let network: StartedNetwork;
  let upstream: HttpsUpstreamContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    certs = getTestCerts();
    network = await new Network().start();
    upstream = await startHttpsUpstream({ network, certs });
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: 'openapi-tls.yaml',
        overlays: [
          'overlay-tls-gateway.yaml',
          'overlay-tls-gateway-listener.yaml',
          'overlay-tls-gateway-ca.yaml',
          'overlay-tls-upstream-https.yaml',
        ],
      },
      tls: {
        certPath: certs.gateway.crt,
        keyPath: certs.gateway.key,
      },
      caPath: certs.ca.crt,
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await upstream?.container.stop();
    await network?.stop();
  });

  test('client connects via HTTPS and gateway proxies to HTTPS upstream', async () => {
    const result = await httpsGet(`${gateway.httpsBaseUrl}/proxy`, certs.ca.crt);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { path: string };
    expect(body.path).toBe('/proxy');
  });
});

// ---------------------------------------------------------------------------
// Test 4: tls-verify: false — request succeeds, warning in logs
// ---------------------------------------------------------------------------

describe('tls-verify: false — dev mode bypass', () => {
  let certs: TestCerts;
  let network: StartedNetwork;
  let upstream: HttpsUpstreamContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    certs = getTestCerts();
    network = await new Network().start();
    upstream = await startHttpsUpstream({ network, certs });
    // No ca: gateway uses system trust store (won't trust test CA).
    // tls-verify: false overrides this and allows the connection anyway.
    gateway = await startGateway({
      network,
      environment: { RUST_LOG: 'warn' },
      fixtures: {
        openapi: 'openapi-tls.yaml',
        overlays: ['overlay-tls-gateway.yaml', 'overlay-tls-upstream-verify-off.yaml'],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await upstream?.container.stop();
    await network?.stop();
  });

  test('request succeeds despite unverified upstream cert', async () => {
    const resp = await fetch(`${gateway.baseUrl}/proxy`);
    expect(resp.status).toBe(200);
  });

  test('gateway logs warn about disabled verification', async () => {
    const logs = await containerLogs(gateway.container);
    expect(logs).toContain('TLS VERIFICATION DISABLED');
    expect(logs).toContain('DO NOT USE IN PRODUCTION');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Upstream cert not in trust store → 502
// ---------------------------------------------------------------------------

describe('HTTPS upstream with untrusted cert → 502', () => {
  let certs: TestCerts;
  let network: StartedNetwork;
  let upstream: HttpsUpstreamContainer;
  let gateway: GatewayContainer;

  beforeAll(async () => {
    certs = getTestCerts();
    network = await new Network().start();
    upstream = await startHttpsUpstream({ network, certs });
    // No ca: gateway uses system trust store which does NOT contain
    // our test CA, so the upstream cert will be rejected.
    gateway = await startGateway({
      network,
      fixtures: {
        openapi: 'openapi-tls.yaml',
        overlays: ['overlay-tls-gateway.yaml', 'overlay-tls-upstream-https.yaml'],
      },
    });
  });

  afterAll(async () => {
    await gateway?.container.stop();
    await upstream?.container.stop();
    await network?.stop();
  });

  test('gateway rejects upstream cert not in trust store and returns 502', async () => {
    const resp = await fetch(`${gateway.baseUrl}/proxy`);
    expect(resp.status).toBe(502);
  });
});
