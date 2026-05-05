# Overlays

Layering multiple OpenAPI Overlays for environment-specific configuration. A dev gateway includes a debug endpoint; a prod gateway removes it.

## What it demonstrates

- Multiple overlay files composed in order
- `remove: true` action to strip paths from the spec
- Shared upstream definition via `$ref`
- Two gateway instances running different overlay stacks (dev vs prod)

## Architecture

```
Client -> gateway-dev  (6188) -> WireMock backend
                                  /products, /products/{id}, /internal/debug

Client -> gateway-prod (6189) -> WireMock backend
                                  /products, /products/{id}
                                  (/internal/debug removed by overlay-prod.yaml)
```

Both gateways share the same base spec and upstream overlay. The prod gateway additionally applies `overlay-prod.yaml`, which removes the `/internal/debug` path.

## Setup

```bash
docker compose up -d
```

This starts two gateway instances:
- **Dev** on port 6188 — overlays: `overlay-gateway.yaml`, `overlay-upstream.yaml`
- **Prod** on port 6189 — overlays: `overlay-gateway.yaml`, `overlay-upstream.yaml`, `overlay-prod.yaml`

## Try it out

### Dev gateway — all routes available

```bash
curl http://localhost:6188/products
curl http://localhost:6188/products/42
curl http://localhost:6188/internal/debug
```

All three routes work on the dev gateway.

### Prod gateway — debug endpoint removed

```bash
curl http://localhost:6189/products
curl http://localhost:6189/internal/debug
```

`/products` works, but `/internal/debug` returns 404 — the prod overlay removed it.

## Cleanup

```bash
docker compose down
```
