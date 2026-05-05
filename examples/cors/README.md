# CORS

Per-operation CORS configuration with restricted origins, credentials support, and automatic preflight handling.

## What it demonstrates

- `x-plenum-cors` extension on individual operations
- Origin matching with exact (`https://example.com`) and glob (`*.example.com`) patterns
- Automatic `OPTIONS` preflight handling
- `allow-credentials`, `expose-headers`, and `max-age` settings
- Routes without CORS for comparison

## Setup

```bash
docker compose up -d
```

## Try it out

### Preflight request

```bash
curl -X OPTIONS http://localhost:6188/products \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep -i access-control
```

The gateway responds with `access-control-allow-origin`, `access-control-allow-credentials`, `access-control-max-age`, and `access-control-expose-headers`.

### Actual request with matching origin

```bash
curl http://localhost:6188/products \
  -H "Origin: https://app.example.com" \
  -v 2>&1 | grep -i access-control
```

The glob pattern `*.example.com` matches, so CORS headers are included.

### Request with non-matching origin

```bash
curl http://localhost:6188/products \
  -H "Origin: https://other.com" \
  -v 2>&1 | grep -i access-control
```

No CORS headers are returned because `https://other.com` doesn't match any configured origin.

### Route without CORS

```bash
curl http://localhost:6188/no-cors \
  -H "Origin: https://example.com" \
  -v 2>&1 | grep -i access-control
```

No CORS headers — this route has no `x-plenum-cors` configured.

## Cleanup

```bash
docker compose down
```
