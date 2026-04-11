import {
  GenericContainer,
  type StartedTestContainer,
  type StartedNetwork,
  Wait,
} from "testcontainers";
import { resolve, dirname, fromFileUrl } from "@std/path";

const GATEWAY_PORT = 6188;
const FIXTURES_DIR = resolve(dirname(fromFileUrl(import.meta.url)), "../../fixtures");

function getImage(): string {
  return "opengateway:latest";
}

export interface GatewayContainer extends AsyncDisposable {
  container: StartedTestContainer;
  baseUrl: string;
}

export async function startGateway(opts: {
  network: StartedNetwork;
  environment?: Record<string, string>;
  fixtures?: {
    openapi?: string;
    overlays?: string[];
    extraFiles?: { source: string; target: string }[];
  };
}): Promise<GatewayContainer> {
  const openapiFile = opts.fixtures?.openapi ?? "openapi.yaml";
  const overlayFiles = opts.fixtures?.overlays ?? [
    "overlay-gateway.yaml",
    "overlay-upstream.yaml",
  ];

  const imageTag = getImage();

  const filesToCopy: { source: string; target: string }[] = [];

  filesToCopy.push({
    source: resolve(FIXTURES_DIR, openapiFile),
    target: `/config/${openapiFile}`,
  });
  for (const overlay of overlayFiles) {
    filesToCopy.push({
      source: resolve(FIXTURES_DIR, overlay),
      target: `/config/${overlay}`,
    });
  }
  for (const extra of opts.fixtures?.extraFiles ?? []) {
    filesToCopy.push({
      source: resolve(FIXTURES_DIR, extra.source),
      target: extra.target,
    });
  }

  let builder = new GenericContainer(imageTag)
    .withExposedPorts(GATEWAY_PORT)
    .withNetwork(opts.network)
    .withCommand([
      "--config-path", "/config",
      "--openapi-schema", openapiFile,
      "--openapi-overlay", overlayFiles.join(","),
    ])
    .withWaitStrategy(Wait.forListeningPorts());

  if (opts.environment) {
    builder = builder.withEnvironment(opts.environment);
  }

  for (const file of filesToCopy) {
    const content = await Deno.readTextFile(file.source);
    builder = builder.withCopyContentToContainer([
      { content, target: file.target },
    ]);
  }

  const container = await builder.start();

  const host = container.getHost();
  const port = container.getMappedPort(GATEWAY_PORT);

  return {
    container,
    baseUrl: `http://${host}:${port}`,
    [Symbol.asyncDispose]: async () => { await container.stop(); },
  };
}
