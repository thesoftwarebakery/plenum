# Full Stack

A comprehensive example that exercises every major Plenum feature together in a single project.

## What it demonstrates

| Route | Features |
|-------|----------|
| `GET /health` | Static response |
| `GET /public/info` | Static response + CORS (open) |
| `GET /products` | HTTP proxy + CORS (restricted origins) |
| `GET /products/{id}` | HTTP proxy + request timeout |
| `POST /products` | HTTP proxy + API key auth + request validation + rate limit + body size limit |
| `PUT /products/{id}` | HTTP proxy + API key auth + request validation + rate limit |
| `GET /items` | Database (`internal:postgres`) |
| `POST /items` | Database + request validation |
| `GET /items/{id}` | Database + 404 handling |
| `GET /pool/status` | Load-balanced pool (round-robin) with health checks |

Additional features:
- Custom gateway error handler (rewrites 504 → 503 with structured error body)
- Environment variable interpolation for all secrets and connection details
- Interceptor chains: `internal:auth-apikey` → `internal:validate-request`

## Architecture

```
Client → Gateway (6188) → WireMock (products backend)
                        → PostgreSQL (items database)
                        → WireMock pool-1 + pool-2 (load-balanced)
                        → static responses (health, info)
```

## Setup

Build the error handler:

```bash
npm install
npm run build
```

Start all services:

```bash
docker compose up -d
```

## Try it out

### Static responses

```bash
curl http://localhost:6188/health
curl http://localhost:6188/public/info
```

### CORS

```bash
# Preflight on public endpoint (open CORS)
curl -X OPTIONS http://localhost:6188/public/info \
  -H "Origin: https://other.com" \
  -H "Access-Control-Request-Method: GET" -v 2>&1 | grep -i access-control

# CORS on products (restricted to *.example.com)
curl http://localhost:6188/products \
  -H "Origin: https://app.example.com" -v 2>&1 | grep -i access-control
```

### API key auth

```bash
# Without API key (401)
curl -X POST http://localhost:6188/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":9.99}'

# With API key
curl -X POST http://localhost:6188/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-api-key" \
  -d '{"name":"Widget","price":9.99}'
```

### Request validation

```bash
# Invalid body (missing required field, negative price)
curl -X POST http://localhost:6188/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-api-key" \
  -d '{"price":-5}'
```

### Rate limiting

```bash
# Send 6 requests — first 5 succeed, 6th gets 429
for i in $(seq 1 6); do
  echo -n "Request $i: "
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:6188/products \
    -H "Content-Type: application/json" \
    -H "x-api-key: my-secret-api-key" \
    -d '{"name":"Test","price":10}'
  echo
done
```

### Database

```bash
# List items
curl http://localhost:6188/items

# Get item by ID
curl http://localhost:6188/items/1

# Create item
curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Thingamajig","description":"A useful thingamajig"}'

# 404
curl http://localhost:6188/items/999
```

### Load-balanced pool

```bash
# Multiple requests distribute across pool-1 and pool-2
curl http://localhost:6188/pool/status
curl http://localhost:6188/pool/status
curl http://localhost:6188/pool/status
curl http://localhost:6188/pool/status
```

## Cleanup

```bash
docker compose down
```
