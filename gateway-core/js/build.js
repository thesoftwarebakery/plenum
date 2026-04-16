/**
 * Build script for bundling the PostgreSQL plugin with postgres.js driver.
 *
 * This bundles the plugin and its dependencies into a single self-contained
 * JavaScript file that can be embedded in the Rust binary via include_str!.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure dist directory exists
mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/plugins/postgres.ts"],
  bundle: true,
  outfile: "dist/postgres.js",
  format: "esm",
  platform: "neutral",
  target: "es2022",
  // Bundle everything including the postgres.js driver
  external: [],
  // Log settings
  logLevel: "info",
  // Don't minify to keep readable for debugging
  minify: false,
});

console.log("Built: dist/postgres.js");