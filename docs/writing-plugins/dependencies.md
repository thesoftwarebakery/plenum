# Dependencies

Plugins can use npm packages. Since the gateway container doesn't include your project's `node_modules`, you need a strategy for making dependencies available at runtime.

## Bundled dependencies (recommended for most packages)

esbuild bundles imported packages into the output file by default. This is the simplest approach — the compiled `dist/plugin.js` is self-contained:

```bash
npm install some-library
npm run build  # esbuild bundles some-library into dist/plugin.js
```

No extra setup needed in the container.

## External dependencies

Some npm packages don't bundle correctly with esbuild. The most common case is **UMD libraries** — packages that use a wrapper like this internally:

```javascript
if (typeof module !== "undefined") {
  module.exports = f();  // clobbers the outer module.exports in the bundle
}
```

When esbuild bundles such a package into a single CJS file, the library's `module.exports = ...` assignment overwrites your plugin's exports, making `init` and `handle` disappear.

### Symptoms

The gateway logs an error like:

```
plugin './dist/my-plugin.js': init() failed: function 'init' not found in module exports
```

Even though the functions are clearly defined in your source code.

### Fix: mark the package as external

Tell esbuild to skip bundling the problematic package:

```json
{
  "scripts": {
    "build": "esbuild src/plugin.ts --bundle --format=cjs --platform=node --target=node22 --outfile=dist/plugin.js --external:problematic-package"
  }
}
```

The compiled output will contain `require("problematic-package")` instead of inlining the package code. Node.js resolves this from `node_modules/` at runtime, which works because the example directory (including `node_modules/`) is volume-mounted into the container.

### How to tell if a package needs `--external`

1. Build and run — if the plugin loads, bundling works fine
2. If you see the "not found in module exports" error, check the bundle for stray `module.exports =` assignments from the dependency
3. Add `--external:package-name` and rebuild

## Multiple entry points

If your project has multiple plugins or interceptors, build each as a separate entry point:

```json
{
  "scripts": {
    "build": "esbuild src/plugin.ts src/interceptor.ts --bundle --format=cjs --platform=node --target=node22 --outdir=dist"
  }
}
```

Use `--outdir` instead of `--outfile` when building multiple files.
