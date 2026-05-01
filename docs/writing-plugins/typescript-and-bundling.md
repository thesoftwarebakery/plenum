# TypeScript and Bundling

Plenum's node runtime loads plugins via `require()`, so plugins must be CommonJS modules. You can write them in plain JavaScript or compile from TypeScript using [esbuild](https://esbuild.github.io/).

## Project setup

```
my-example/
  src/
    my-plugin.ts
  dist/
    my-plugin.js      ← compiled output, loaded by the gateway
  package.json
  tsconfig.json
  openapi.yaml
  overlay-gateway.yaml
  docker-compose.yaml
```

### package.json

```json
{
  "private": true,
  "scripts": {
    "build": "esbuild src/my-plugin.ts --bundle --format=cjs --platform=node --target=node22 --outfile=dist/my-plugin.js"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## Build command

The key esbuild flags:

| Flag | Purpose |
|------|---------|
| `--bundle` | Bundle all imports into a single file |
| `--format=cjs` | Output CommonJS so the gateway can `require()` it |
| `--platform=node` | Target Node.js (includes built-in modules) |
| `--target=node22` | Match the gateway's Node.js version |

```bash
npm install
npm run build
```

## Using `export` syntax

When writing TypeScript with `import` statements, use standard `export` syntax for plugin functions:

```typescript
// ✅ Correct — use export function
import someLib from "some-library";

export function init(options: unknown) {
  return {};
}

export function handle(input: PluginInput): PluginOutput {
  return { status: 200, headers: {}, body: {} };
}
```

Do **not** mix `import` with `exports.xxx =` assignments — esbuild treats files with `import` as ES modules, and CJS-style `exports` assignments will be silently lost in the bundle:

```typescript
// ❌ Wrong — exports are lost when mixed with import
import someLib from "some-library";

exports.init = function init() { ... };    // not exported in the bundle
exports.handle = function handle() { ... }; // not exported in the bundle
```

## Overlay configuration

Point the upstream to the compiled output:

```yaml
x-plenum-upstream:
  kind: "plugin"
  plugin: "./dist/my-plugin.js"
```

## Build before running

Always build before starting the gateway:

```bash
npm install
npm run build
docker compose up -d
```

The `dist/` directory is volume-mounted into the container alongside the rest of your config.
