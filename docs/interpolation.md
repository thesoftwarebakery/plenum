# Interpolation

Plenum supports boot-time interpolation in all `x-plenum-*` extension string values using the `${{ namespace.key }}` syntax. This lets you inject environment variables, file contents, and other values into your configuration.

## Syntax

All interpolation uses the same `${{ }}` template syntax:

| Expression | Description |
|------------|-------------|
| `${{ env.VAR }}` | Value of environment variable `VAR` |
| `${{ file.NAME.content }}` | Contents of a file declared in `x-plenum-files` |
| `${{ file.NAME.path }}` | Resolved absolute path to the file |

Whitespace inside the braces is optional — `${{env.VAR}}` and `${{ env.VAR }}` are equivalent.

## Environment variables

Reference environment variables with `${{ env.VAR }}`:

```yaml
x-plenum-upstream:
  kind: "HTTP"
  address: "${{ env.BACKEND_HOST }}"
  port: 8080
```

If the variable is not set, Plenum fails at startup with an error. To provide defaults, set them when running the container:

```bash
docker run -e BACKEND_HOST=api.example.com ...
```

Or in Docker Compose:

```yaml
environment:
  - BACKEND_HOST=${BACKEND_HOST:-localhost}
```

## File interpolation

Inject file contents or paths into config values using `${{ file.NAME.accessor }}`. First, declare your files in `x-plenum-files` at the spec root:

```yaml
x-plenum-files:
  jwt-secret: /run/secrets/jwt-secret
  ca-bundle: /etc/ssl/custom-ca.pem
```

Then reference them by name:

```yaml
x-plenum-interceptor:
  - module: "./interceptors/auth.js"
    hook: on_request_headers
    function: checkJwt
    options:
      secret: "${{ file.jwt-secret.content }}"
```

Files are read at startup. Relative paths resolve against `--config-path`. Missing files cause a startup error.

### File accessors

Each file entry is a descriptor with two accessors:

| Accessor | Description |
|----------|-------------|
| `${{ file.NAME.content }}` | File contents |
| `${{ file.NAME.path }}` | Resolved absolute path to the file |

An accessor is always required — bare `${{ file.NAME }}` is an error.

The `.path` accessor is useful for fields that expect a filesystem path rather than inline content — for example, TLS certificate and key paths:

```yaml
x-plenum-files:
  gateway-cert: /certs/gateway.crt
  gateway-key: /certs/gateway.key

x-plenum-config:
  tls:
    cert: "${{ file.gateway-cert.path }}"
    key: "${{ file.gateway-key.path }}"
```

### Declaring files via overlay

```yaml
overlay: 1.1.0
info:
  title: File declarations
  version: 1.0.0
actions:
  - target: $
    update:
      x-plenum-files:
        jwt-secret: /run/secrets/jwt-secret
```

## Where interpolation works

Interpolation applies to **all string values** in any `x-plenum-*` extension — universally, with no exceptions:

- Upstream addresses, ports, TLS cert/key/CA paths
- Interceptor module paths and options
- Plugin options and permissions
- CORS origins and headers
- Static response bodies
- Backend config values

## Runtime tokens

The `${{ }}` syntax is also used for runtime context resolution in certain fields (e.g. `hash-key` in load balancing, queries in `x-plenum-backend`). These use different namespaces:

| Namespace | Resolved at | Example |
|-----------|------------|---------|
| `env` | Boot time | `${{ env.API_KEY }}` |
| `file` | Boot time | `${{ file.secret.content }}`, `${{ file.cert.path }}` |
| `header` | Request time | `${{ header.x-user-id }}` |
| `query` | Request time | `${{ query.page }}` |
| `path` | Request time | `${{ path.id }}` |
| `body` | Request time | `${{ body.name }}` |
| `cookie` | Request time | `${{ cookie.session }}` |
| `client-ip` | Request time | `${{ client-ip }}` |

Boot-time tokens (`env`, `file`) are resolved once at startup. Runtime tokens pass through and are resolved per-request.

`query.*` tokens resolve from parsed query parameters (`queryParams`), so values are typed — an integer query param resolves as a number, not a string. Use `query.*` tokens in `x-plenum-backend.params` to safely pass query parameter values to database queries:

```yaml
x-plenum-backend:
  query: "SELECT * FROM users LIMIT $1"
  params:
    - "${{query.limit}}"
```

The gateway resolves each entry in `params` before calling the plugin. The resolved values are passed as a native parameter array — never interpolated into the query string.
