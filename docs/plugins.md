# Plugins

Plugins are JavaScript modules that handle requests directly instead of proxying to an HTTP backend. Use them for custom logic, computed responses, or database queries.

> **Working example**: see [`examples/plugins/`](../examples/plugins/)
> ```bash
> cd examples/plugins
> docker compose up
> ```

## Writing a plugin

A plugin exports two functions:

```javascript
// plugins/hello.js

// Called once at startup. Return value is available as plugin state.
exports.init = function init(options) {
  return {};
};

// Called for each request. Returns the full response.
exports.handle = function handle(input) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: {
      message: "Hello from plugin",
      path: input.request.path,
      params: input.request.params,
    },
  };
};
```

## Configuration

Set `kind: "plugin"` on the upstream and point to the module:

```yaml
x-plenum-upstream:
  kind: "plugin"
  plugin: "./plugins/hello.js"
```

## Plugin input

The `handle()` function receives:

| Field | Description |
|-------|-------------|
| `request.method` | HTTP method |
| `request.path` | Full request path |
| `request.params` | Path parameters |
| `request.query` | Query string |
| `request.headers` | Request headers |
| `body` | Request body (for POST/PUT/PATCH) |
| `config` | Value from `x-plenum-backend` (per-operation config) |
| `operation` | OpenAPI operation metadata |

## Plugin output

Return a response object:

```javascript
{
  status: 200,
  headers: { "content-type": "application/json" },
  body: { ... },  // JSON object, string, or null
}
```

## Per-operation config with `x-plenum-backend`

Pass operation-specific config to the plugin via `x-plenum-backend`. This is useful when the same plugin handles multiple routes differently:

```yaml
actions:
  - target: "$.paths['/users'].get"
    update:
      x-plenum-backend:
        query: "SELECT * FROM users"
  - target: "$.paths['/users/{id}'].get"
    update:
      x-plenum-backend:
        query: "SELECT * FROM users WHERE id = ${{path.id}}"
```

The plugin receives this as `input.config`.

## Permissions and timeouts

Plugins support the same permission model as [interceptors](interceptor-permissions.md):

```yaml
x-plenum-upstream:
  kind: "plugin"
  plugin: "./plugins/db-query.js"
  timeout-ms: 5000
  options:
    host: "${{ env.DB_HOST }}"
  permissions:
    env: ["DB_HOST", "DB_PASSWORD"]
    net: ["${{ env.DB_HOST }}"]
```

## Built-in plugins

Plenum includes built-in database plugins:

| Plugin | Description |
|--------|-------------|
| `internal:postgres` | PostgreSQL queries |
| `internal:mysql` | MySQL queries |
| `internal:mongodb` | MongoDB queries |

These are referenced by name instead of file path:

```yaml
x-plenum-upstream:
  kind: "plugin"
  plugin: "internal:postgres"
  options:
    host: "${{ env.DB_HOST }}"
    port: "${{ env.DB_PORT }}"
    database: "${{ env.DB_NAME }}"
    user: "${{ env.DB_USER }}"
    password: "${{ env.DB_PASSWORD }}"
  permissions:
    env: ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    net: ["${{ env.DB_HOST }}"]
```
