# Interceptor Permissions

Sandboxed interceptors with explicit permission grants. This example shows an API key validation interceptor that requires `permissions.env` to read the expected key from an environment variable.

## What it demonstrates

- `permissions.env` granting access to specific environment variables
- Interceptor using `process.env` to read a granted variable
- Short-circuit response (401) when authentication fails
- Environment variables passed via Docker Compose

## Architecture

```
Client -> Gateway (6188) -> check-api-key interceptor -> WireMock backend
              |                     |
              |                     +-- API_KEY env var (granted via permissions.env)
```

## Setup

```bash
docker compose up -d
```

The `API_KEY` environment variable is set to `my-secret-key` in `docker-compose.yaml`.

## Try it out

### Request without API key

```bash
curl http://localhost:6188/products
# {"error": "Invalid or missing API key"}
```

Returns 401 — no `x-api-key` header provided.

### Request with wrong API key

```bash
curl http://localhost:6188/products -H "x-api-key: wrong-key"
# {"error": "Invalid or missing API key"}
```

Returns 401 — the key doesn't match.

### Request with correct API key

```bash
curl http://localhost:6188/products -H "x-api-key: my-secret-key"
```

The request passes through to the backend.

## Cleanup

```bash
docker compose down
```
