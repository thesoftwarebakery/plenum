/**
 * E2E latency benchmark suite for OpenGateway.
 *
 * A single network and wiremock container are shared across all scenarios.
 * Only the gateway container is replaced per scenario (it's the thing that
 * differs). Wiremock stubs are reset between scenarios.
 *
 * Results are printed as a human-readable table and saved as
 * github-action-benchmark "customSmallerIsBetter" JSON.
 *
 * Run with:
 *   cd e2e && npm run bench
 *
 * Output: bench-results.json (in the e2e/ directory)
 */

import { Bench } from "tinybench";
import { Network } from "testcontainers";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startGateway } from "../src/containers/gateway";
import { startWiremock } from "../src/containers/wiremock";
import { WireMockClient } from "../src/helpers/wiremock-client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start the gateway, retrying if Docker reports a port-binding conflict.
 *
 * After a high-traffic gateway container is stopped, Docker Desktop on macOS
 * can take a moment to flush its iptables NAT rules even after the container
 * removal promise resolves. This is a Docker daemon race condition -- we detect
 * the specific error and retry rather than sleeping blindly.
 */
async function startGatewayWithRetry(
  opts: Parameters<typeof startGateway>[0],
  maxAttempts = 5,
): ReturnType<typeof startGateway> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await startGateway(opts);
    } catch (err) {
      const isPortConflict =
        err instanceof Error && err.message.includes("address already in use");
      if (!isPortConflict || attempt === maxAttempts) throw err;
      console.log(`  [attempt ${attempt + 1}/${maxAttempts}] Docker NAT cleanup pending, retrying...`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  openapi: string;
  overlays: string[];
  extraFiles?: { source: string; target: string }[];
  /** Path to send GET requests to. Must be matched by the OpenAPI spec. */
  path: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: "passthrough",
    openapi: "openapi.yaml",
    overlays: ["overlay-gateway.yaml", "overlay-upstream.yaml"],
    path: "/products",
  },
  {
    name: "add-header-interceptor",
    openapi: "openapi-interceptor.yaml",
    overlays: ["overlay-interceptor-upstream.yaml", "overlay-interceptor-add-header.yaml"],
    extraFiles: [
      { source: "interceptors/add-header.js", target: "/config/interceptors/add-header.js" },
    ],
    path: "/products",
  },
  {
    name: "all-hooks",
    openapi: "openapi-interceptor.yaml",
    overlays: ["overlay-interceptor-upstream.yaml", "overlay-interceptor-all-hooks.yaml"],
    extraFiles: [
      { source: "interceptors/all-hooks.js", target: "/config/interceptors/all-hooks.js" },
    ],
    path: "/products",
  },
  {
    name: "response-body-interceptor",
    openapi: "openapi-interceptor-body.yaml",
    overlays: [
      "overlay-interceptor-body-upstream-buffered.yaml",
      "overlay-interceptor-modify-response-body.yaml",
    ],
    extraFiles: [
      { source: "interceptors/modify-response-body.js", target: "/config/interceptors/modify-response-body.js" },
    ],
    path: "/products",
  },
];

// ---------------------------------------------------------------------------
// Types for output
// ---------------------------------------------------------------------------

interface BenchEntry {
  name: string;
  unit: string;
  value: number;
  extra: string;
}

// ---------------------------------------------------------------------------
// Run a single scenario against a running network and wiremock instance
// ---------------------------------------------------------------------------

async function runScenario(
  scenario: Scenario,
  network: Awaited<ReturnType<typeof Network.prototype.start>>,
  wm: WireMockClient,
): Promise<BenchEntry[]> {
  console.log(`\n--- ${scenario.name} ---`);

  await wm.reset();
  await wm.stubFor({
    request: { method: "GET", urlPath: scenario.path },
    response: {
      status: 200,
      jsonBody: { items: ["widget"] },
      headers: { "Content-Type": "application/json" },
    },
  });

  const gateway = await startGatewayWithRetry({
    network,
    fixtures: {
      openapi: scenario.openapi,
      overlays: scenario.overlays,
      extraFiles: scenario.extraFiles,
    },
  });

  const url = `${gateway.baseUrl}${scenario.path}`;

  const bench = new Bench({
    time: 10_000,      // 10s measurement window
    warmupTime: 2_000, // 2s warmup
  });

  bench.add(scenario.name, async () => {
    const resp = await fetch(url);
    await resp.text();
  });

  await bench.run();

  await gateway.container.stop();

  const task = bench.tasks[0];
  if (task.result?.state === "error") {
    throw new Error(`Bench task "${scenario.name}" failed`);
  }
  const r = task.result!.latency;

  const p99 = r.p99;
  const mean = r.mean;
  const min = r.min;
  const samples = r.samplesCount;

  console.log(`  samples: ${samples}`);
  console.log(`  mean:    ${mean.toFixed(2)} ms`);
  console.log(`  min:     ${min.toFixed(2)} ms`);
  console.log(`  p99:     ${p99.toFixed(2)} ms`);

  return [
    {
      name: `${scenario.name} mean latency`,
      unit: "ms",
      value: Number(mean.toFixed(3)),
      extra: `n=${samples}`,
    },
    {
      name: `${scenario.name} p99 latency`,
      unit: "ms",
      value: Number(p99.toFixed(3)),
      extra: `n=${samples}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// System warmup: a throwaway passthrough run before any measured scenario.
// ---------------------------------------------------------------------------

async function warmupSystem(
  network: Awaited<ReturnType<typeof Network.prototype.start>>,
  wm: WireMockClient,
): Promise<void> {
  console.log("--- system warmup (unmeasured) ---");
  await wm.reset();
  await wm.stubFor({
    request: { method: "GET", urlPath: "/products" },
    response: {
      status: 200,
      jsonBody: { items: ["widget"] },
      headers: { "Content-Type": "application/json" },
    },
  });
  const gateway = await startGatewayWithRetry({
    network,
    fixtures: {
      openapi: "openapi.yaml",
      overlays: ["overlay-gateway.yaml", "overlay-upstream.yaml"],
    },
  });
  const url = `${gateway.baseUrl}/products`;
  const end = Date.now() + 5_000;
  while (Date.now() < end) {
    const resp = await fetch(url);
    await resp.text();
  }
  await gateway.container.stop();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const wm = new WireMockClient(wiremock.adminUrl);

  const results: BenchEntry[] = [];

  try {
    await warmupSystem(network, wm);
    for (const scenario of SCENARIOS) {
      const entries = await runScenario(scenario, network, wm);
      results.push(...entries);
    }
  } finally {
    await wiremock.container.stop();
    await network.stop();
  }

  // Print summary table
  console.log("\n=== Latency Summary ===");
  console.log(
    `${"Scenario".padEnd(45)} ${"Mean (ms)".padStart(10)} ${"p99 (ms)".padStart(10)}`
  );
  console.log("-".repeat(67));
  for (let i = 0; i < results.length; i += 2) {
    const meanEntry = results[i];
    const p99Entry = results[i + 1];
    const scenarioName = meanEntry.name.replace(" mean latency", "");
    console.log(
      `${scenarioName.padEnd(45)} ${meanEntry.value.toFixed(2).padStart(10)} ${p99Entry.value.toFixed(2).padStart(10)}`
    );
  }

  // Write github-action-benchmark JSON
  const outputPath = resolve(__dirname, "../bench-results.json");
  await writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to bench-results.json`);

  // testcontainers keeps a background Ryuk reaper socket open for resource
  // cleanup. All containers and networks are already stopped in the finally
  // block above, so a clean exit is safe here.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
