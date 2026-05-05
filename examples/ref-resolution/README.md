# `$ref` Resolution

Shared upstream, interceptor, and CORS definitions using `$ref` — keeping overlay configuration DRY.

## What it demonstrates

- Shared upstream definition via `$ref` (`#/components/x-upstreams/default`)
- Shared interceptor chain via `$ref` (`#/components/x-interceptors/require-api-key`)
- Shared CORS policy via `$ref` (`#/components/x-cors-policies/public`)
- A single overlay file defining all shared config, applied to multiple routes

## Architecture

```
Client -> Gateway (6188) -> WireMock backend
            |
            +-- /products: API key auth (shared interceptor)
            +-- /orders:   API key auth (same shared interceptor)
            +-- /public/status: public CORS (shared policy), no auth
```

## Setup

```bash
docker compose up -d
```

The `API_KEY` environment variable is set to `my-secret-key` in `docker-compose.yaml`.

## Try it out

### Protected endpoint without API key

```bash
curl http://localhost:6188/products
# {"error": "Invalid or missing API key"}
```

### Protected endpoint with API key

```bash
curl http://localhost:6188/products -H "x-api-key: my-secret-key"
```

### Same interceptor reused on another route

```bash
curl http://localhost:6188/orders
# {"error": "Invalid or missing API key"}

curl http://localhost:6188/orders -H "x-api-key: my-secret-key"
```

Both `/products` and `/orders` reference the same `require-api-key` interceptor chain.

### Public endpoint with CORS

```bash
curl -X OPTIONS http://localhost:6188/public/status \
  -H "Origin: https://any-origin.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep -i access-control
```

The `/public/status` route uses the shared `public` CORS policy (wildcard `*` origin).

```bash
curl http://localhost:6188/public/status
```

No authentication required on this route.

## Cleanup

```bash
docker compose down
```
