# Plugins

A simple echo plugin that returns request details as JSON. Demonstrates the plugin `init`/`handle` pattern and access to request data, path parameters, query parameters, and per-operation backend config.

## What it demonstrates

- Plugin upstream (`kind: "plugin"`)
- Plugin lifecycle: `init()` called once at startup, `handle()` called per request
- Access to `input.request` (method, path, params, query, queryParams)
- Access to `input.body` for POST requests
- Per-operation config via `x-plenum-backend` passed as `input.config`
- No backend services needed — the plugin handles everything

## Setup

```bash
docker compose up -d
```

## Try it out

### Basic GET

```bash
curl http://localhost:6188/echo
```

Returns the request method, path, and the per-operation backend config (`table: "echo"`, `query: "list"`).

### GET with query parameters

```bash
curl "http://localhost:6188/echo?message=hello&count=3"
```

The `queryParams` field contains typed values — `count` is a number, not a string.

### GET with array query parameters

```bash
curl "http://localhost:6188/echo?tags=a&tags=b"
```

The `queryParams.tags` field is an array `["a", "b"]`.

### GET with path parameter

```bash
curl http://localhost:6188/echo/42
```

The `params` field contains `{"id": "42"}`, and the backend config includes `query: "get_by_id"`.

### POST with body

```bash
curl -X POST http://localhost:6188/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

The `body` field contains the parsed request body.

## Cleanup

```bash
docker compose down
```
