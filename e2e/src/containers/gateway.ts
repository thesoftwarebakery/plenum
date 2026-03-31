import {
  GenericContainer,
  type StartedTestContainer,
  type StartedNetwork,
  Wait,
} from "testcontainers";
import { resolve, dirname, fromFileUrl } from "@std/path";

const GATEWAY_PORT = 6188;
const FIXTURES_DIR = resolve(dirname(fromFileUrl(import.meta.url)), "../../fixtures");

let builtImage: GenericContainer | null = null;

async function getImage(): Promise<GenericContainer> {
  if (builtImage) return builtImage;

  const contextDir = resolve(dirname(fromFileUrl(import.meta.url)), "../../..");
  builtImage = await GenericContainer.fromDockerfile(contextDir).build(
    "opengateway-test",
    { deleteOnExit: false },
  );
  return builtImage;
}

export interface GatewayContainer extends AsyncDisposable {
  container: StartedTestContainer;
  baseUrl: string;
}

export async function startGateway(opts: {
  network: StartedNetwork;
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

  const image = await getImage();

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

  let builder = image
    .withExposedPorts(GATEWAY_PORT)
    .withNetwork(opts.network)
    .withCommand([
      "--config-path", "/config",
      "--openapi-schema", openapiFile,
      "--openapi-overlay", overlayFiles.join(","),
    ])
    .withWaitStrategy(Wait.forListeningPorts());

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
