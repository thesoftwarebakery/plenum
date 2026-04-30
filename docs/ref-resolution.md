# `$ref` resolution

Any `x-plenum-*` extension value can be a `$ref` pointing to a shared definition elsewhere in the document. This lets you define config once and reuse it across paths and operations — keeping your overlays DRY and consistent.

> **Working example**: see [`examples/ref-resolution/`](../examples/ref-resolution/)
> ```bash
> cd examples/ref-resolution
> docker compose up
> ```

## How it works

Instead of inlining a config value, replace it with a `$ref`:

```yaml
x-plenum-upstream:
  $ref: "#/components/x-upstreams/default"
```

Plenum resolves the reference at startup by following the [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) path (`#/components/x-upstreams/default`) to find the actual value in the merged document.

## Defining shared config

Store reusable config under `components` using any key you like:

```yaml
actions:
  - target: $
    update:
      components:
        x-upstreams:
          default: { ... }
          admin: { ... }
        x-interceptors:
          auth: [ ... ]
          logging: [ ... ]
        x-cors-policies:
          public: { ... }
          internal: { ... }
```

The key names under `components` are arbitrary — Plenum doesn't prescribe a naming convention. Use whatever makes sense for your project.

## What supports `$ref`

Any `x-plenum-*` extension value:

| Extension | Example `$ref` target |
|-----------|----------------------|
| `x-plenum-upstream` | `#/components/x-upstreams/default` |
| `x-plenum-interceptor` | `#/components/x-interceptors/auth` |
| `x-plenum-cors` | `#/components/x-cors-policies/public` |
| `x-plenum-backend` | `#/components/x-backends/users-query` |

## Examples

### Shared upstreams

Route most paths to one backend, specific paths to another:

```yaml
components:
  x-upstreams:
    main:
      kind: "HTTP"
      address: "api"
      port: 8080
    admin:
      kind: "HTTP"
      address: "admin-api"
      port: 9090
```

```yaml
# All paths get the main upstream
- target: $.paths[*]
  update:
    x-plenum-upstream:
      $ref: "#/components/x-upstreams/main"

# Override /admin
- target: "$.paths['/admin']"
  update:
    x-plenum-upstream:
      $ref: "#/components/x-upstreams/admin"
```

### Shared interceptor chains

Apply the same auth interceptor to multiple operations without repeating the config:

```yaml
components:
  x-interceptors:
    require-api-key:
      - module: "internal:auth-apikey"
        hook: on_request_headers
        function: checkApiKey
        options:
          header: "x-api-key"
          envVar: "API_KEY"
        permissions:
          env: ["API_KEY"]
```

```yaml
- target: "$.paths['/products'].get"
  update:
    x-plenum-interceptor:
      $ref: "#/components/x-interceptors/require-api-key"

- target: "$.paths['/orders'].get"
  update:
    x-plenum-interceptor:
      $ref: "#/components/x-interceptors/require-api-key"
```

### Shared CORS policies

Define a CORS policy once, apply it to multiple operations:

```yaml
components:
  x-cors-policies:
    public-api:
      origins: ["*"]
      methods: [GET]
      max-age: 86400
    authenticated:
      origins: ["https://app.example.com"]
      methods: [GET, POST, PUT, DELETE]
      headers: [Content-Type, Authorization]
      allow-credentials: true
      max-age: 3600
```

```yaml
- target: "$.paths['/products'].get"
  update:
    x-plenum-cors:
      $ref: "#/components/x-cors-policies/public-api"

- target: "$.paths['/account'].get"
  update:
    x-plenum-cors:
      $ref: "#/components/x-cors-policies/authenticated"
```

### Shared backend config

Reuse database query patterns across plugin routes:

```yaml
components:
  x-backends:
    list-all:
      query: "SELECT * FROM users"
    get-by-id:
      query: "SELECT id, name FROM users WHERE id = $1"
      params:
        - "${{path.id}}"
```

The `params` array accepts `${{...}}` tokens that the gateway resolves at request time. Values are passed to the database driver as a native parameter array — never interpolated into the query string.

## Resolution details

- **Syntax**: `$ref` values use JSON Pointer format — `#/path/to/value`
- **Scope**: the `#` refers to the root of the fully merged document (spec + all overlays applied)
- **Recursive**: a `$ref` can point to another `$ref` — Plenum follows the chain
- **Errors**: an invalid or missing reference causes a startup error with a clear message
- **Timing**: references are resolved at startup, not at request time
