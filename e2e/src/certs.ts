/**
 * Test TLS certificate generation using openssl.
 * Certs are generated fresh for each test run so they never expire.
 * SANs are set correctly so modern TLS validators accept them.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CERT_DIR_ENV = 'PLENUM_TEST_CERT_DIR';

export interface TestCerts {
  dir: string;
  ca: { crt: string; key: string };
  /** Gateway listener cert: SAN=DNS:localhost,IP:127.0.0.1 */
  gateway: { crt: string; key: string };
  /** Upstream cert: SAN=DNS:upstream-tls (matches Docker network alias) */
  upstream: { crt: string; key: string };
}

function openssl(...args: string[]): void {
  execFileSync('openssl', args, { stdio: 'pipe' });
}

function buildPaths(dir: string): TestCerts {
  return {
    dir,
    ca: { crt: join(dir, 'ca.crt'), key: join(dir, 'ca.key') },
    gateway: { crt: join(dir, 'gateway.crt'), key: join(dir, 'gateway.key') },
    upstream: { crt: join(dir, 'upstream.crt'), key: join(dir, 'upstream.key') },
  };
}

/**
 * Generate fresh test CA + server certs via openssl.
 * Sets PLENUM_TEST_CERT_DIR so worker forks can read the paths.
 * Call cleanupTestCerts() in teardown.
 */
export function generateTestCerts(): TestCerts {
  const dir = mkdtempSync(join(tmpdir(), 'plenum-e2e-certs-'));
  process.env[CERT_DIR_ENV] = dir;

  const { ca, gateway, upstream } = buildPaths(dir);

  // --- CA ---
  openssl(
    'req', '-x509', '-newkey', 'rsa:2048',
    '-keyout', ca.key, '-out', ca.crt,
    '-days', '1', '-nodes', '-subj', '/CN=Plenum Test CA',
  );

  // --- Gateway cert (localhost + 127.0.0.1) ---
  const gatewayCnf = join(dir, 'gateway.cnf');
  writeFileSync(gatewayCnf, `\
[req]
req_extensions = v3_req
distinguished_name = req_distinguished_name
[req_distinguished_name]
[v3_req]
subjectAltName = DNS:localhost,IP:127.0.0.1
`);
  const gatewayCsr = join(dir, 'gateway.csr');
  openssl(
    'req', '-newkey', 'rsa:2048', '-keyout', gateway.key, '-out', gatewayCsr,
    '-nodes', '-subj', '/CN=localhost', '-config', gatewayCnf,
  );
  openssl(
    'x509', '-req', '-in', gatewayCsr, '-CA', ca.crt, '-CAkey', ca.key,
    '-CAcreateserial', '-out', gateway.crt, '-days', '1',
    '-extensions', 'v3_req', '-extfile', gatewayCnf,
  );

  // --- Upstream cert (matches 'upstream-tls' Docker network alias) ---
  const upstreamCnf = join(dir, 'upstream.cnf');
  writeFileSync(upstreamCnf, `\
[req]
req_extensions = v3_req
distinguished_name = req_distinguished_name
[req_distinguished_name]
[v3_req]
subjectAltName = DNS:upstream-tls
`);
  const upstreamCsr = join(dir, 'upstream.csr');
  openssl(
    'req', '-newkey', 'rsa:2048', '-keyout', upstream.key, '-out', upstreamCsr,
    '-nodes', '-subj', '/CN=upstream-tls', '-config', upstreamCnf,
  );
  openssl(
    'x509', '-req', '-in', upstreamCsr, '-CA', ca.crt, '-CAkey', ca.key,
    '-CAcreateserial', '-out', upstream.crt, '-days', '1',
    '-extensions', 'v3_req', '-extfile', upstreamCnf,
  );

  return buildPaths(dir);
}

/**
 * Read cert paths from the env var set by generateTestCerts().
 * Safe to call from vitest worker forks.
 */
export function getTestCerts(): TestCerts {
  const dir = process.env[CERT_DIR_ENV];
  if (!dir) throw new Error('Test certs not initialised — PLENUM_TEST_CERT_DIR not set');
  return buildPaths(dir);
}

export function cleanupTestCerts(certs: TestCerts): void {
  rmSync(certs.dir, { recursive: true, force: true });
}
