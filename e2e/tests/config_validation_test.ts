import { Network, GenericContainer, Wait, type StartedNetwork } from "testcontainers";
import { resolve, dirname, fromFileUrl } from "@std/path";
import { startGateway } from "../src/containers/gateway.ts";

const FIXTURES_DIR = resolve(dirname(fromFileUrl(import.meta.url)), "../fixtures");

function getImage(): string {
  return "opengateway:latest";
}

/**
 * Starts the gateway container with the given config and asserts it exits with
 * a non-zero exit code (i.e. startup failure). Passes if the container fails to
 * start; throws if the container starts successfully.
 */
async function assertGatewayFailsToStart(opts: {
  network: StartedNetwork;
  openapi?: string;
  overlays: string[];
  extraFiles?: { source: string; target: string }[];
}): Promise<void> {
  const openapiFile = opts.openapi ?? "openapi.yaml";
  const overlayFiles = opts.overlays;

  let builder = new GenericContainer(getImage())
    .withNetwork(opts.network)
    .withCommand([
      "--config-path", "/config",
      "--openapi-schema", openapiFile,
      "--openapi-overlay", overlayFiles.join(","),
    ])
    .withWaitStrategy(Wait.forOneShotStartup())
    .withStartupTimeout(15_000);

  for (const file of [openapiFile, ...overlayFiles]) {
    const content = await Deno.readTextFile(resolve(FIXTURES_DIR, file));
    builder = builder.withCopyContentToContainer([
      { content, target: `/config/${file}` },
    ]);
  }

  for (const extra of opts.extraFiles ?? []) {
    const content = await Deno.readTextFile(resolve(FIXTURES_DIR, extra.source));
    builder = builder.withCopyContentToContainer([
      { content, target: extra.target },
    ]);
  }

  try {
    const container = await builder.start();
    await container.stop();
    throw new Error(
      "Gateway started successfully but a startup failure was expected. " +
        "Check that deny_unknown_fields is applied to the relevant config struct."
    );
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Gateway started successfully")
    ) {
      throw err;
    }
    // Container exited with non-zero code -- this is the expected outcome.
  }
}

Deno.test(
  {
    name: "gateway fails to start when x-opengateway-upstream contains an unknown field",
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async () => {
    await using network = await new Network().start();

    await assertGatewayFailsToStart({
      network,
      overlays: ["overlay-gateway.yaml", "overlay-bad-upstream-typo.yaml"],
    });
  }
);

Deno.test(
  {
    name: "gateway fails to start when plugin options reference an unset env var",
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async () => {
    await using network = await new Network().start();

    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-unset-var.yaml"],
      extraFiles: [
        { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
      ],
    });
  }
);

Deno.test(
  {
    name: "gateway fails to start when plugin init() throws",
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async () => {
    await using network = await new Network().start();

    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-throw-init.yaml"],
      extraFiles: [
        { source: "plugins/throw_init.js", target: "/config/plugins/throw_init.js" },
      ],
    });
  }
);

Deno.test(
  {
    name: "gateway starts when plugin options use ${VAR:-default} for an unset env var",
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async () => {
    await using network = await new Network().start();

    await using _gateway = await startGateway({
      network,
      fixtures: {
        openapi: "openapi-plugin.yaml",
        overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-default-var.yaml"],
        extraFiles: [
          { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
        ],
      },
    });

    // Gateway started successfully -- the default value resolved without error.
  }
);
