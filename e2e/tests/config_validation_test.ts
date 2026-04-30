import { test, expect } from 'vitest';
import { Network, GenericContainer, Wait, type StartedNetwork } from 'testcontainers';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { startGateway } from '../src/containers/gateway';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../fixtures');

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

  let builder = new GenericContainer("plenum:latest")
    .withNetwork(opts.network)
    .withCommand([
      "--config-path", "/config",
      "--openapi-schema", openapiFile,
      "--openapi-overlay", overlayFiles.join(","),
    ])
    .withWaitStrategy(Wait.forOneShotStartup())
    .withStartupTimeout(15_000);

  for (const file of [openapiFile, ...overlayFiles]) {
    const content = await readFile(resolve(FIXTURES_DIR, file), 'utf-8');
    builder = builder.withCopyContentToContainer([
      { content, target: `/config/${file}` },
    ]);
  }

  for (const extra of opts.extraFiles ?? []) {
    const content = await readFile(resolve(FIXTURES_DIR, extra.source), 'utf-8');
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

test("gateway fails to start when x-plenum-upstream contains an unknown field", async () => {
  const network = await new Network().start();

  try {
    await assertGatewayFailsToStart({
      network,
      overlays: ["overlay-gateway.yaml", "overlay-bad-upstream-typo.yaml"],
    });
  } finally {
    await network.stop();
  }
});

test("gateway fails to start when plugin options reference an unset env var", async () => {
  const network = await new Network().start();

  try {
    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-unset-var.yaml"],
      extraFiles: [
        { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
      ],
    });
  } finally {
    await network.stop();
  }
});

test("gateway fails to start when plugin init() throws", async () => {
  const network = await new Network().start();

  try {
    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-throw-init.yaml"],
      extraFiles: [
        { source: "plugins/throw_init.js", target: "/config/plugins/throw_init.js" },
      ],
    });
  } finally {
    await network.stop();
  }
});

test("gateway starts when plugin options use ${{ env.VAR }} with the var set", async () => {
  const network = await new Network().start();
  const gateway = await startGateway({
    network,
    environment: { PLENUM_TEST_HOST: "localhost" },
    fixtures: {
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-default-var.yaml"],
      extraFiles: [
        { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
      ],
    },
  });

  try {
    // Gateway started successfully -- the env var resolved without error.
  } finally {
    await gateway.container.stop();
    await network.stop();
  }
});

test("plugin with validate() passes -> gateway starts", async () => {
  const network = await new Network().start();
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-validate-pass.yaml"],
      extraFiles: [
        { source: "plugins/validate_echo.js", target: "/config/plugins/validate_echo.js" },
      ],
    },
  });

  try {
    // Gateway started successfully.
  } finally {
    await gateway.container.stop();
    await network.stop();
  }
});

test("plugin with validate() fails -> gateway fails to start", async () => {
  const network = await new Network().start();

  try {
    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-validate-fail.yaml"],
      extraFiles: [
        { source: "plugins/validate_echo.js", target: "/config/plugins/validate_echo.js" },
      ],
    });
  } finally {
    await network.stop();
  }
});

test("plugin without validate() -> gateway starts", async () => {
  const network = await new Network().start();
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-plugin.yaml",
      overlays: ["overlay-plugin-gateway.yaml", "overlay-plugin-upstream-no-validate.yaml"],
      extraFiles: [
        { source: "plugins/echo.js", target: "/config/plugins/echo.js" },
      ],
    },
  });

  try {
    // Gateway started successfully.
  } finally {
    await gateway.container.stop();
    await network.stop();
  }
});

test("interceptor with validate() passes -> gateway starts", async () => {
  const network = await new Network().start();
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: "openapi-interceptor.yaml",
      overlays: ["overlay-interceptor-localhost-upstream.yaml", "overlay-interceptor-validate-pass.yaml"],
      extraFiles: [
        { source: "interceptors/validate_options.js", target: "/config/interceptors/validate_options.js" },
      ],
    },
  });

  try {
    // Gateway started successfully.
  } finally {
    await gateway.container.stop();
    await network.stop();
  }
});

test("interceptor with validate() fails -> gateway fails to start", async () => {
  const network = await new Network().start();

  try {
    await assertGatewayFailsToStart({
      network,
      openapi: "openapi-interceptor.yaml",
      overlays: ["overlay-interceptor-localhost-upstream.yaml", "overlay-interceptor-validate-fail.yaml"],
      extraFiles: [
        { source: "interceptors/validate_options.js", target: "/config/interceptors/validate_options.js" },
      ],
    });
  } finally {
    await network.stop();
  }
});
