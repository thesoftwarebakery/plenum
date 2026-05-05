# Validation

Request validation using the built-in `internal:validate-request` interceptor. Invalid requests are rejected with a 400 response before reaching the backend.

## What it demonstrates

- `internal:validate-request` interceptor on the `on_request` hook
- Validation against the OpenAPI `requestBody` schema
- 400 response with structured validation errors
- Routes without validation for comparison

## Setup

```bash
docker compose up -d
```

## Try it out

### Valid request

```bash
curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "quantity": 5}'
```

The request passes validation and is proxied to the backend.

### Missing required field

```bash
curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget"}'
```

Returns 400 — `quantity` is required by the schema.

### Wrong type

```bash
curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "quantity": "five"}'
```

Returns 400 — `quantity` must be an integer.

### Route without validation

```bash
curl http://localhost:6188/items
```

`GET /items` has no interceptor, so requests pass through without validation.

## Cleanup

```bash
docker compose down
```
