# Static Responses

Return pre-built responses directly from the gateway without hitting a backend. Useful for health endpoints, redirects, and mock responses.

## What it demonstrates

- Static upstream type (`kind: "static"`)
- Custom status code, headers, and JSON body
- 301 redirect with `Location` header
- Mixing static and proxied routes in the same spec

## Architecture

```
Client -> Gateway (6188) -> static response (health, redirect)
                         -> WireMock backend (products)
```

## Setup

```bash
docker compose up -d
```

## Try it out

### Health check (static JSON response)

```bash
curl http://localhost:6188/health
# {"status": "healthy"}
```

### Redirect (static 301)

```bash
curl -v http://localhost:6188/old-path 2>&1 | grep -i location
# Location: http://localhost:6188/products

# Follow the redirect
curl -L http://localhost:6188/old-path
```

### Proxied route

```bash
curl http://localhost:6188/products
```

This request passes through to the WireMock backend, while `/health` and `/old-path` are handled entirely by the gateway.

## Cleanup

```bash
docker compose down
```
