/**
 * A simple Node.js HTTPS upstream server for TLS e2e tests.
 * Uses the test CA-signed cert so the gateway can verify it.
 *
 * The server echoes `{ path, method }` as JSON for every request.
 * It is NOT wiremock — no stubbing, just a predictable HTTPS target.
 */
import { GenericContainer, type StartedTestContainer, type StartedNetwork, Wait } from 'testcontainers';
import { readFileSync } from 'node:fs';
import type { TestCerts } from '../certs';

const HTTPS_PORT = 443;

// Minimal Node.js HTTPS echo server. Copied into the container at startup.
const SERVER_SCRIPT = `
const https = require('https');
const fs = require('fs');

const server = https.createServer({
  cert: fs.readFileSync('/certs/upstream.crt'),
  key: fs.readFileSync('/certs/upstream.key'),
}, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, method: req.method }));
  });
});

server.listen(${HTTPS_PORT}, () => {
  process.stdout.write('https-upstream ready\\n');
});
`;

export interface HttpsUpstreamContainer {
  container: StartedTestContainer;
  /** Network alias clients inside Docker use to reach this upstream */
  alias: string;
  /** HTTPS port (443) inside Docker — use alias + this port in gateway config */
  port: number;
}

export async function startHttpsUpstream(opts: {
  network: StartedNetwork;
  alias?: string;
  certs: TestCerts;
}): Promise<HttpsUpstreamContainer> {
  const alias = opts.alias ?? 'upstream-tls';

  const caCrt = readFileSync(opts.certs.ca.crt);
  const upstreamCrt = readFileSync(opts.certs.upstream.crt);
  const upstreamKey = readFileSync(opts.certs.upstream.key);

  const container = await new GenericContainer('node:22-slim')
    .withExposedPorts(HTTPS_PORT)
    .withNetwork(opts.network)
    .withNetworkAliases(alias)
    .withCopyContentToContainer([
      { content: SERVER_SCRIPT, target: '/server.js' },
      { content: caCrt, target: '/certs/ca.crt' },
      { content: upstreamCrt, target: '/certs/upstream.crt' },
      { content: upstreamKey, target: '/certs/upstream.key' },
    ])
    .withCommand(['node', '/server.js'])
    .withWaitStrategy(Wait.forLogMessage('https-upstream ready'))
    .start();

  return { container, alias, port: HTTPS_PORT };
}
