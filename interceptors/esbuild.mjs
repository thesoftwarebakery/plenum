import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');
const outDir = join(__dirname, '..', 'gateway-core', 'js', 'dist');

mkdirSync(outDir, { recursive: true });

const entries = readdirSync(srcDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => join(srcDir, f));

for (const entry of entries) {
  const name = basename(entry, '.ts');
  const outfile = join(outDir, `${name}.js`);
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    minify: false,
    target: 'es2022',
  });
  console.log(`Built: ${outfile}`);
}
