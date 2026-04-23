import { GenericContainer, type StartedTestContainer, type StartedNetwork, Wait } from 'testcontainers';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const GATEWAY_PORT = 6188;
const GATEWAY_TLS_PORT = 6189;

export interface GatewayContainer {
  container: StartedTestContainer;
  /** HTTP base URL (always present) */
  baseUrl: string;
  /** HTTPS base URL (present when TLS is configured) */
  httpsBaseUrl?: string;
}

export interface GatewayTlsOptions {
  /** Path to PEM cert for the inbound TLS listener */
  certPath: string;
  /** Path to PEM key for the inbound TLS listener */
  keyPath: string;
}

export async function startGateway(opts: {
  network: StartedNetwork;
  environment?: Record<string, string>;
  /** Grant the gateway container elevated privileges (needed when bwrap sandboxing is active). */
  privileged?: boolean;
  fixtures?: {
    openapi?: string;
    overlays?: string[];
    extraFiles?: { source: string; target: string }[];
  };
  /** When set, enables the inbound TLS listener on port 6189. */
  tls?: GatewayTlsOptions;
  /**
   * Path to a PEM CA bundle copied into the container at /certs/ca.crt.
   * Referenced by x-plenum-config.ca_file in overlay fixtures.
   * Independent of the TLS listener — used for outbound upstream verification.
   */
  caPath?: string;
}): Promise<GatewayContainer> {
  const openapiFile = opts.fixtures?.openapi ?? 'openapi.yaml';
  const overlayFiles = opts.fixtures?.overlays ?? ['overlay-gateway.yaml', 'overlay-upstream.yaml'];

  const filesToCopy: { source: string; target: string }[] = [];
  filesToCopy.push({ source: resolve(FIXTURES_DIR, openapiFile), target: `/config/${openapiFile}` });
  for (const overlay of overlayFiles) {
    filesToCopy.push({ source: resolve(FIXTURES_DIR, overlay), target: `/config/${overlay}` });
  }
  for (const extra of opts.fixtures?.extraFiles ?? []) {
    filesToCopy.push({ source: resolve(FIXTURES_DIR, extra.source), target: extra.target });
  }

  const exposedPorts = opts.tls ? [GATEWAY_PORT, GATEWAY_TLS_PORT] : [GATEWAY_PORT];

  let builder = new GenericContainer('plenum:latest')
    .withExposedPorts(...exposedPorts)
    .withNetwork(opts.network)
    .withCommand(['--config-path', '/config', '--openapi-schema', openapiFile, '--openapi-overlay', overlayFiles.join(',')])
    // Wait for an HTTP response from any path — even a 404 (unmatched route)
    // confirms the gateway is initialised and serving. This is more reliable than
    // waiting for port binding alone, especially under parallel test load.
    // When TLS is also configured, both listeners are started from the same server
    // bootstrap so HTTP readiness implies TLS readiness too.
    .withWaitStrategy(Wait.forHttp('/nonexistent', GATEWAY_PORT).forResponsePredicate(() => true));

  if (opts.privileged) {
    builder = builder.withPrivilegedMode();
  }

  if (opts.environment) {
    builder = builder.withEnvironment(opts.environment);
  }

  // Copy TLS cert/key for the inbound listener.
  if (opts.tls) {
    const certContent = await readFile(opts.tls.certPath, 'utf-8');
    const keyContent = await readFile(opts.tls.keyPath, 'utf-8');
    builder = builder
      .withCopyContentToContainer([{ content: certContent, target: '/certs/gateway.crt' }])
      .withCopyContentToContainer([{ content: keyContent, target: '/certs/gateway.key' }]);
  }

  // Copy the CA bundle for outbound upstream verification (independent of the listener).
  if (opts.caPath) {
    const caContent = await readFile(opts.caPath, 'utf-8');
    builder = builder.withCopyContentToContainer([{ content: caContent, target: '/certs/ca.crt' }]);
  }

  for (const file of filesToCopy) {
    const content = await readFile(file.source, 'utf-8');
    builder = builder.withCopyContentToContainer([{ content, target: file.target }]);
  }

  const container = await builder.start();
  const host = container.getHost();
  const port = container.getMappedPort(GATEWAY_PORT);

  const result: GatewayContainer = {
    container,
    baseUrl: `http://${host}:${port}`,
  };

  if (opts.tls) {
    const tlsPort = container.getMappedPort(GATEWAY_TLS_PORT);
    result.httpsBaseUrl = `https://${host}:${tlsPort}`;
  }

  return result;
}
