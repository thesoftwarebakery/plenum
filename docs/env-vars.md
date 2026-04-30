# Environment variable substitution

Plenum supports environment variable substitution in configuration values, allowing you to keep environment-specific details out of your spec and overlays.

## Syntax

| Pattern | Description |
|---------|-------------|
| `${VAR}` | Replaced with the value of `VAR`. Errors if unset. |
| `${VAR:-default}` | Replaced with the value of `VAR`, or `default` if unset. |

## Where it works

Substitution applies to string values in:

- Upstream addresses and ports
- TLS certificate and CA paths
- Interceptor and plugin module paths
- Plugin options
- Interceptor permissions (e.g. allowed network hosts)

## Example

An overlay that reads the backend address from the environment:

```yaml
overlay: 1.1.0
info:
  title: Upstream configuration
  version: 1.0.0
actions:
  - target: $
    update:
      components:
        x-upstreams:
          default:
            kind: "HTTP"
            address: "${BACKEND_HOST}"
            port: ${BACKEND_PORT:-8080}
  - target: $.paths[*]
    update:
      x-plenum-upstream:
        $ref: "#/components/x-upstreams/default"
```

```bash
docker run -d \
  -v $(pwd):/config \
  -p 6188:6188 \
  -e BACKEND_HOST=api.example.com \
  -e BACKEND_PORT=3000 \
  ghcr.io/thesoftwarebakery/plenum \
  --config-path /config \
  --openapi-schema openapi.yaml \
  --openapi-overlay overlay-gateway.yaml,overlay-upstream.yaml
```

## Error behaviour

If a variable is referenced with `${VAR}` (no default) and is not set, Plenum will fail to start with an error indicating the missing variable.
