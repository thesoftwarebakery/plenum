/**
 * Build script for bundling database plugins with their Deno-native drivers.
 *
 * Uses `deno bundle` to resolve Deno URL imports and bundle each plugin
 * into a single self-contained JavaScript file that can be embedded in the
 * Rust binary via include_str!.
 *
 * Run: deno run -A build.ts
 */

const plugins = ["postgres", "mysql", "mongodb"];

await Deno.mkdir("dist", { recursive: true });

for (const plugin of plugins) {
  const entry = `src/plugins/${plugin}.ts`;
  try {
    await Deno.stat(entry);
  } catch {
    console.log(`Skipping ${plugin} (${entry} not found)`);
    continue;
  }

  console.log(`Bundling ${plugin}...`);
  const cmd = new Deno.Command("deno", {
    args: ["bundle", entry, "-o", `dist/${plugin}.js`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  if (code !== 0) {
    console.error(`Failed to bundle ${plugin}`);
    Deno.exit(1);
  }
  console.log(`Built: dist/${plugin}.js`);
}
