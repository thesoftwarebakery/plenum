/**
 * E2E latency benchmark suite for OpenGateway.
 *
 * Each scenario starts a fresh gateway + wiremock container pair, runs a
 * warmup phase, then measures latency over a fixed time window using tinybench.
 * Results are printed as a human-readable table and saved as
 * github-action-benchmark "customSmallerIsBetter" JSON.
 *
 * Run with:
 *   cd e2e && deno task bench
 *
 * Output: bench-results.json (in the e2e/ directory)
 */

import { Bench } from "tinybench";
import { Network } from "testcontainers";
import { startGateway } from "../src/containers/gateway.ts";
import { startWiremock } from "../src/containers/wiremock.ts";
import { WireMockClient } from "../src/helpers/wiremock-client.ts";

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
    openapi: "openapi-interceptor.yaml",
    overlays: ["overlay-interceptor-upstream.yaml", "overlay-interceptor-modify-response-body.yaml"],
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
// Run a single scenario
// ---------------------------------------------------------------------------

async function runScenario(scenario: Scenario): Promise<BenchEntry[]> {
  console.log(`\n--- ${scenario.name} ---`);

  const network = await new Network().start();
  const wiremock = await startWiremock({ network, alias: "wiremock" });
  const gateway = await startGateway({
    network,
    fixtures: {
      openapi: scenario.openapi,
      overlays: scenario.overlays,
      extraFiles: scenario.extraFiles,
    },
  });

  const wm = new WireMockClient(wiremock.adminUrl);
  await wm.stubFor({
    request: { method: "GET", urlPath: scenario.path },
    response: {
      status: 200,
      jsonBody: { items: ["widget"] },
      headers: { "Content-Type": "application/json" },
    },
  });

  const url = `${gateway.baseUrl}${scenario.path}`;

  const bench = new Bench({
    time: 10_000,      // 10s measurement window
    warmupTime: 2_000, // 2s warmup
    iterations: 1,     // run each sample once (latency-focused, not throughput)
  });

  bench.add(scenario.name, async () => {
    const resp = await fetch(url);
    await resp.body?.cancel();
  });

  await bench.run();

  await gateway.container.stop();
  await wiremock.container.stop();
  await network.stop();

  const task = bench.tasks[0];
  const r = task.result!;

  // tinybench reports times in milliseconds
  const p99 = r.p99;
  const mean = r.mean;
  const min = r.min;
  const samples = r.samples.length;

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
// Main
// ---------------------------------------------------------------------------

const results: BenchEntry[] = [];

for (const scenario of SCENARIOS) {
  const entries = await runScenario(scenario);
  results.push(...entries);
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
const outputPath = new URL("../bench-results.json", import.meta.url);
await Deno.writeTextFile(outputPath, JSON.stringify(results, null, 2));
console.log(`\nResults written to bench-results.json`);
