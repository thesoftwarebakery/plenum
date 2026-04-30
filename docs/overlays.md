# OpenAPI Overlays

Plenum uses [OpenAPI Overlays](https://github.com/OAI/Overlay-Specification) to inject gateway configuration into your OpenAPI spec. Overlays keep your API definition clean — the base spec stays a standard OpenAPI document, and all `x-plenum-*` extensions are applied separately.

> **Working example**: see [`examples/overlays/`](../examples/overlays/)
> ```bash
> cd examples/overlays
> docker compose up
> ```

## Why overlays?

Without overlays, you'd need to add `x-plenum-config`, `x-plenum-upstream`, and other gateway extensions directly into your OpenAPI spec. This mixes API documentation with infrastructure concerns and makes the spec harder to reuse across tools.

With overlays, you maintain:
- A clean OpenAPI spec (usable with Swagger UI, code generators, etc.)
- Separate overlay files for gateway config, upstreams, interceptors, CORS, etc.
- Environment-specific overlays (dev vs staging vs production)

## Overlay structure

An overlay file has an `overlay` version, `info` block, and a list of `actions`:

```yaml
overlay: 1.1.0
info:
  title: My overlay
  version: 1.0.0
actions:
  - target: <JSONPath expression>
    update: <value to merge>
```

## Actions

### update

Merges a value into the target. For objects, keys are merged (existing keys are overwritten). This is the most common action.

```yaml
actions:
  # Add gateway config to the spec root
  - target: $
    update:
      x-plenum-config:
        threads: 2
        listen: "0.0.0.0:6188"

  # Add an upstream to a specific path
  - target: "$.paths['/products']"
    update:
      x-plenum-upstream:
        kind: "HTTP"
        address: "backend"
        port: 8080
```

### remove

Removes the target from the document:

```yaml
actions:
  # Remove a path entirely
  - target: "$.paths['/internal']"
    remove: true
```

## JSONPath targeting

Overlay actions use JSONPath expressions to select where in the spec to apply changes.

| Pattern | Selects |
|---------|---------|
| `$` | The root of the document |
| `$.paths[*]` | All path items |
| `$.paths['/products']` | A specific path item |
| `$.paths['/products'].get` | A specific operation |
| `$.paths['/products/{id}']` | A parameterised path |

**Note**: paths containing `/` require bracket notation (`$.paths['/products']`), not dot notation (`$.paths./products`).

## Shared config with `$ref`

Any `x-plenum-*` extension value can be a `$ref` that points to a shared definition elsewhere in the document. Plenum resolves these references at startup, so you can define config once and reuse it across paths and operations.

### Shared upstreams

The most common use — define upstream backends once and reference them per-path:

```yaml
actions:
  # Define shared upstreams under components
  - target: $
    update:
      components:
        x-upstreams:
          default:
            kind: "HTTP"
            address: "backend"
            port: 8080
          admin:
            kind: "HTTP"
            address: "admin-service"
            port: 9090

  # Apply the default upstream to all paths
  - target: $.paths[*]
    update:
      x-plenum-upstream:
        $ref: "#/components/x-upstreams/default"

  # Override a specific path with a different upstream
  - target: "$.paths['/admin']"
    update:
      x-plenum-upstream:
        $ref: "#/components/x-upstreams/admin"
```

### Shared interceptor chains

Reuse the same interceptor configuration across multiple operations:

```yaml
actions:
  - target: $
    update:
      components:
        x-interceptors:
          auth:
            - module: "internal:auth-apikey"
              hook: on_request_headers
              function: checkApiKey
              options:
                header: "x-api-key"
                envVar: "API_KEY"
              permissions:
                env: ["API_KEY"]

  - target: "$.paths['/products'].get"
    update:
      x-plenum-interceptor:
        $ref: "#/components/x-interceptors/auth"

  - target: "$.paths['/orders'].get"
    update:
      x-plenum-interceptor:
        $ref: "#/components/x-interceptors/auth"
```

### How `$ref` resolution works

- References use JSON Pointer syntax: `#/components/x-upstreams/default`
- The `#` refers to the root of the merged document (spec + overlays)
- References resolve recursively — a `$ref` can point to another `$ref`
- You can store shared config under any key in `components` (e.g. `x-upstreams`, `x-interceptors`, `x-cors-policies`)
- Resolution happens at startup; invalid references cause a clear error

## Layering multiple overlays

Overlays are applied in order. Later overlays can override values set by earlier ones. This enables environment-specific configuration:

```
openapi.yaml                  # Base API spec (no gateway config)
├── overlay-gateway.yaml      # Server settings (threads, listen address)
├── overlay-upstream.yaml     # Backend addresses
└── overlay-interceptors.yaml # Interceptor chain
```

```bash
docker run ... ghcr.io/thesoftwarebakery/plenum \
  --openapi-overlay overlay-gateway.yaml,overlay-upstream.yaml,overlay-interceptors.yaml
```

### Environment-specific overlays

Use different upstream overlays per environment:

```bash
# Development
--openapi-overlay overlay-gateway.yaml,overlay-upstream-dev.yaml

# Production
--openapi-overlay overlay-gateway.yaml,overlay-upstream-prod.yaml
```

Where `overlay-upstream-dev.yaml` points to local services and `overlay-upstream-prod.yaml` points to production backends (or uses [environment variable substitution](env-vars.md)).
