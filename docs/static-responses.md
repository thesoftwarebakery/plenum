# Static responses

Static upstreams return a pre-built response directly from the gateway without proxying to a backend. Useful for health endpoints, mocks, redirects, and fallback responses.

> **Working example**: see [`examples/static-responses/`](../examples/static-responses/)
> ```bash
> cd examples/static-responses
> docker compose up
> ```

## Configuration

Set `kind: "static"` on `x-plenum-upstream`:

```yaml
x-plenum-upstream:
  kind: "static"
  status: 200
  headers:
    Content-Type: application/json
  body: '{"status": "healthy"}'
```

| Field | Required | Description |
|-------|----------|-------------|
| `kind` | Yes | Must be `"static"` |
| `status` | Yes | HTTP status code |
| `headers` | No | Response headers |
| `body` | No | Response body (string) |

## Examples

### Health endpoint

```yaml
# overlay-static.yaml
actions:
  - target: "$.paths['/health'].get"
    update:
      x-plenum-upstream:
        kind: "static"
        status: 200
        headers:
          Content-Type: application/json
        body: '{"status": "healthy"}'
```

```bash
$ curl http://localhost:6188/health
{"status": "healthy"}
```

### Redirect

```yaml
x-plenum-upstream:
  kind: "static"
  status: 301
  headers:
    Location: "https://example.com/new-path"
```

### Empty response

```yaml
x-plenum-upstream:
  kind: "static"
  status: 204
```

## Mixing with proxied routes

Static and proxied routes can coexist in the same spec. Apply the static upstream to specific paths and proxy the rest:

```yaml
actions:
  # Static health endpoint
  - target: "$.paths['/health']"
    update:
      x-plenum-upstream:
        kind: "static"
        status: 200
        headers:
          Content-Type: application/json
        body: '{"status": "healthy"}'

  # Proxy everything else
  - target: "$.paths['/products']"
    update:
      x-plenum-upstream:
        $ref: "#/components/x-upstreams/default"
```
