# Writing Plugins

This guide covers how to write custom Plenum plugins — from the basic contract to TypeScript setup and bundling.

> **Working examples**:
> - [`examples/plugins/`](../../examples/plugins/) — minimal echo plugin (plain JS)
> - [`examples/mock-api/`](../../examples/mock-api/) — TypeScript plugin with npm dependencies

## Plugin contract

A plugin module exports two functions:

### `init(options)`

Called once at gateway startup. Receives the `options` object from the upstream config. Use it for setup (database connections, configuration validation, etc.). Return value is ignored.

```javascript
exports.init = function init(options) {
  // options comes from x-plenum-upstream.options
  return {};
};
```

### `handle(input)`

Called for each incoming request. Must return a response object.

```javascript
exports.handle = function handle(input) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { message: "Hello", path: input.request.path },
  };
};
```

## Plugin input

The `handle()` function receives:

| Field | Type | Description |
|-------|------|-------------|
| `request.method` | `string` | HTTP method |
| `request.path` | `string` | Full request path |
| `request.route` | `string` | Matched OpenAPI path template (e.g. `/users/{id}`) |
| `request.params` | `Record<string, unknown>` | Path parameters, coerced to the declared schema type |
| `request.query` | `string` | Raw query string (for backward compatibility) |
| `request.queryParams` | `Record<string, unknown>` | Parsed query parameters, typed per the OpenAPI spec |
| `request.headers` | `Record<string, string>` | Request headers |
| `body` | `unknown` | Parsed request body (for POST/PUT/PATCH) |
| `config` | `unknown` | Value from `x-plenum-backend` with `${{...}}` tokens resolved |
| `operation` | `object` | OpenAPI operation metadata (parameters, responses, schemas) |
| `ctx` | `Record<string, unknown>` | User context from interceptors |

## Plugin output

Return a response object:

```javascript
{
  status: 200,                                    // HTTP status code
  headers: { "content-type": "application/json" }, // Response headers
  body: { ... },                                   // JSON object, string, or null
}
```

## Next steps

- [TypeScript and Bundling](typescript-and-bundling.md) — compile TypeScript plugins with esbuild
- [Dependencies](dependencies.md) — use npm packages in plugins
- [Types](types.md) — type definitions for plugin input/output
