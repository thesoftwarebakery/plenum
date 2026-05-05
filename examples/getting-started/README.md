# Getting Started

The simplest possible Plenum setup — an HTTP proxy that routes requests from an OpenAPI spec to a single WireMock backend.

## What it demonstrates

- OpenAPI spec as the routing definition
- HTTP proxy upstream (`kind: "HTTP"`)
- Overlay-based configuration (separate gateway and upstream overlays)
- Shared upstream definition via `$ref`

## Architecture

```
Client -> Gateway (6188) -> WireMock backend (8080)
```

## Setup

```bash
docker compose up -d
```

## Try it out

### List products

```bash
curl http://localhost:6188/products
```

### Get a single product

```bash
curl http://localhost:6188/products/42
```

Both requests are proxied to the WireMock backend, which echoes back the request method, path, and headers.

## Cleanup

```bash
docker compose down
```
