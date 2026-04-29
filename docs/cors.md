# CORS

Plenum handles CORS at the gateway level, so your backends don't need to. CORS is configured per-operation via the `x-plenum-cors` extension.

> **Working example**: see [`examples/cors/`](../examples/cors/)
> ```bash
> cd examples/cors
> docker compose up
> ```

## Configuration

Add `x-plenum-cors` to an operation via an overlay:

```yaml
actions:
  - target: "$.paths['/products'].get"
    update:
      x-plenum-cors:
        origins:
          - "https://example.com"
        methods: [GET]
        headers: [Content-Type, Authorization]
```

| Field | Default | Description |
|-------|---------|-------------|
| `origins` | — | Allowed origins (required) |
| `methods` | `GET, POST, HEAD` | Allowed HTTP methods |
| `headers` | — | Allowed request headers |
| `allow-credentials` | `false` | Allow credentials |
| `max-age` | `86400` | Preflight cache duration (seconds) |
| `expose-headers` | — | Response headers exposed to the browser |

## Origin matching

Origins support three patterns:

| Pattern | Example | Matches |
|---------|---------|---------|
| Exact | `https://example.com` | Only that origin |
| Glob prefix | `*.example.com` | Any subdomain |
| Wildcard | `*` | Any origin (incompatible with `allow-credentials: true`) |

## Preflight requests

When a browser sends a preflight `OPTIONS` request, Plenum responds with a `204` directly — the request never reaches your backend. The response includes the configured CORS headers.

## Operations without CORS

Operations without `x-plenum-cors` do not receive any CORS headers. Requests to those endpoints are proxied as normal.
