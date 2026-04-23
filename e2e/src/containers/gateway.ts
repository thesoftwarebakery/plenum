import { GenericContainer, type StartedTestContainer, type StartedNetwork, Wait } from 'testcontainers';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const GATEWAY_PORT = 6188;

export interface GatewayContainer {
  container: StartedTestContainer;
  baseUrl: string;
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

  let builder = new GenericContainer('plenum:latest')
    .withExposedPorts(GATEWAY_PORT)
    .withNetwork(opts.network)
    .withCommand(['--config-path', '/config', '--openapi-schema', openapiFile, '--openapi-overlay', overlayFiles.join(',')])
    // Wait for an HTTP response from any path — even a 404 (unmatched route)
    // confirms the gateway is initialised and serving. This is more reliable than
    // waiting for port binding alone, especially under parallel test load.
    .withWaitStrategy(Wait.forHttp('/nonexistent', GATEWAY_PORT).forResponsePredicate(() => true));

  if (opts.privileged) {
    builder = builder.withPrivilegedMode();
  }

  if (opts.environment) {
    builder = builder.withEnvironment(opts.environment);
  }

  for (const file of filesToCopy) {
    const content = await readFile(file.source, 'utf-8');
    builder = builder.withCopyContentToContainer([{ content, target: file.target }]);
  }

  const container = await builder.start();
  const host = container.getHost();
  const port = container.getMappedPort(GATEWAY_PORT);

  return {
    container,
    baseUrl: `http://${host}:${port}`,
  };
}
