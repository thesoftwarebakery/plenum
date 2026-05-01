# Mock API

A complete mock API that generates schema-compliant responses from your OpenAPI spec — no real backend needed.

Uses [json-schema-faker](https://github.com/json-schema-faker/json-schema-faker) as a custom plugin to read response schemas from the OpenAPI spec and generate deterministic fake data. The `{id}` path parameter is used as a random seed, so the same ID always returns the same data.

## What it demonstrates

- Custom plugins with TypeScript + esbuild
- Plugin access to OpenAPI operation metadata (`input.operation.responses`)
- npm dependency bundling for the gateway runtime
- Running the gateway with no backend services

## Setup

Install dependencies and build the plugin:

```bash
npm install
npm run build
```

Start the gateway:

```bash
docker compose up -d
```

## Try it out

List users:

```bash
curl http://localhost:6188/users
```

Get a specific user (deterministic — same ID always returns the same data):

```bash
curl http://localhost:6188/users/42
curl http://localhost:6188/users/42  # same response
curl http://localhost:6188/users/7   # different response
```

Paginate lists (different pages produce different deterministic data):

```bash
curl http://localhost:6188/users              # default page=0
curl 'http://localhost:6188/users?page=0'     # same as above
curl 'http://localhost:6188/users?page=1'     # different data, but deterministic
```

List products:

```bash
curl http://localhost:6188/products
```

Get a specific product:

```bash
curl http://localhost:6188/products/1
```

## How it works

The plugin reads the response schema from `input.operation.responses["200"].content["application/json"].schema` at request time. It seeds json-schema-faker with a hash of the `{id}` path parameter, producing deterministic output — the same ID always generates the same fake data.

The TypeScript source in `src/mock.ts` is compiled to a single JavaScript file via esbuild, with `json-schema-faker` bundled in. The plugin uses json-schema-faker's first-class `seed` option in `generate()` — no custom RNG needed.

List endpoints accept a `page` query parameter (default `0`) that seeds the random generator, so different pages produce different but deterministic data.

For more on plugin authoring patterns, see the [Writing Plugins](../../docs/writing-plugins/index.md) guide.

## Cleanup

```bash
docker compose down
```
