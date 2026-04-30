# Plugins

Plugins are JavaScript modules that handle requests directly instead of proxying to an HTTP backend. Use them for custom logic, computed responses, or database queries.

> **Working example**: see [`examples/plugins/`](../examples/plugins/)
> ```bash
> cd examples/plugins
> docker compose up
> ```

## Configuration

Set `kind: "plugin"` on the upstream and point to the module:

```yaml
x-plenum-upstream:
  kind: "plugin"
  plugin: "./plugins/hello.js"
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
        query: "SELECT * FROM users WHERE id = $1"
        params:
          - "${{path.id}}"
```

The plugin receives this as `input.config`. The gateway resolves `${{...}}` tokens in `params` at request time and passes the resolved array as `input.config.params`. The built-in database plugins feed this array directly into native parameterised queries — never string-interpolating user input into SQL.

### Parameterised queries

Always put request-derived values in `params`, not inline in the query string. The gateway resolves each `${{...}}` token before calling the plugin:

```yaml
x-plenum-backend:
  query: "SELECT id, name FROM users WHERE role = $1 AND active = $2"
  params:
    - "${{query.role}}"
    - "${{query.active}}"
```

Available token namespaces in `params`:

| Token | Resolves to |
|-------|-------------|
| `${{path.NAME}}` | Path parameter value |
| `${{query.NAME}}` | Parsed query parameter value (from `queryParams`) |
| `${{header.NAME}}` | Request header value |
| `${{body.NAME}}` | Top-level field from the JSON request body |

MySQL uses `?` placeholders; PostgreSQL uses `$1`, `$2`, …

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

## Writing custom plugins

See the [Writing Plugins](writing-plugins/index.md) guide for the full authoring workflow — plugin contract, TypeScript setup, bundling, and dependency management.
