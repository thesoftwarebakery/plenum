# Interceptors

Interceptors are JavaScript modules that hook into the request/response lifecycle. They let you add authentication, transform requests and responses, inject headers, and short-circuit requests with custom responses.

> **Working example**: see [`examples/interceptors/`](../examples/interceptors/)
> ```bash
> cd examples/interceptors
> docker compose up
> ```

## Writing an interceptor

An interceptor is a JavaScript file that exports a function. The function receives request or response data and returns an action:

```javascript
// interceptors/add-header.js
exports.onRequest = function onRequest(request) {
  return {
    action: "continue",
    headers: { "x-request-id": crypto.randomUUID() },
  };
};
```

## Registering interceptors

Attach interceptors to operations via `x-plenum-interceptor` in an overlay:

```yaml
actions:
  - target: "$.paths['/products'].get"
    update:
      x-plenum-interceptor:
        - module: "./interceptors/add-header.js"
          hook: on_request
          function: onRequest
```

To apply to all operations of a method:

```yaml
actions:
  - target: $.paths[*].get
    update:
      x-plenum-interceptor:
        - module: "./interceptors/add-header.js"
          hook: on_request
          function: onRequest
```

## Lifecycle hooks

Interceptors fire at specific points in the request lifecycle:

| Hook | Input | Can short-circuit | Description |
|------|-------|-------------------|-------------|
| `on_request_headers` | Headers only | Yes | Before request body is read |
| `on_request` | Headers + body | Yes | After full request body is buffered |
| `before_upstream` | Headers | No | Modify upstream request headers |
| `on_response` | Response headers | No | After upstream response headers received |
| `on_response_body` | Response headers + body | No | After full response body buffered |

**Note**: `on_response_body` requires `buffer-response: true` on the upstream config.

## Return format

### Continue

Passes the request to the next phase. Optionally modifies headers and shares context:

```javascript
{
  action: "continue",
  headers: { "x-custom": "value", "x-remove-me": null },  // null deletes a header
  ctx: { userId: "123" },  // shared with subsequent interceptors
}
```

### Short-circuit

Returns a response directly without reaching the upstream. Only available in `on_request_headers` and `on_request` hooks:

```javascript
{
  action: "respond",
  status: 403,
  headers: { "content-type": "application/json" },
  body: { error: "Forbidden" },
}
```

## Context passing

Interceptors can share data via the `ctx` object. Values set in `ctx` are merged across interceptor calls within the same request:

```javascript
// First interceptor (on_request_headers)
exports.extractUser = function extractUser(request) {
  return {
    action: "continue",
    ctx: { userId: request.headers["x-user-id"] },
  };
};

// Later interceptor (on_request) — reads from ctx
exports.checkAuth = function checkAuth(request) {
  const userId = request.ctx.userId;  // set by previous interceptor
  if (!userId) {
    return { action: "respond", status: 401, body: { error: "Unauthorized" } };
  }
  return { action: "continue" };
};
```

## Chaining interceptors

Multiple interceptors can be attached to the same operation. They execute in the order listed:

```yaml
x-plenum-interceptor:
  - module: "./interceptors/auth.js"
    hook: on_request_headers
    function: checkApiKey
  - module: "./interceptors/logging.js"
    hook: on_request
    function: logRequest
  - module: "./interceptors/transform.js"
    hook: on_response
    function: addHeaders
```

If any interceptor short-circuits, subsequent interceptors in that phase are skipped.

## Passing options

Static configuration can be passed to interceptors via `options`:

```yaml
x-plenum-interceptor:
  - module: "./interceptors/rate-limit.js"
    hook: on_request_headers
    function: checkRate
    options:
      maxRequests: 100
      windowMs: 60000
```

Accessed in the interceptor via `request.options`:

```javascript
exports.checkRate = function checkRate(request) {
  const { maxRequests, windowMs } = request.options;
  // ...
};
```

## Interceptor input

The function receives a request or response object depending on the hook:

### Request hooks (`on_request_headers`, `on_request`, `before_upstream`)

| Field | Description |
|-------|-------------|
| `method` | HTTP method |
| `path` | Full request path |
| `route` | OpenAPI path template (e.g. `/products/{id}`) |
| `headers` | Request headers |
| `query` | Raw query string |
| `queryParams` | Parsed query parameters (`Record<string, unknown>`), typed per the OpenAPI spec |
| `params` | Path parameters (`Record<string, unknown>`), coerced to the declared schema type (`integer`, `boolean`, etc.) |
| `ctx` | Context bag (shared across interceptors) |
| `body` | Request body (`on_request` only) |
| `options` | Per-interceptor config from overlay |

### Response hooks (`on_response`, `on_response_body`)

| Field | Description |
|-------|-------------|
| `status` | Response status code |
| `headers` | Response headers |
| `ctx` | Context bag |
| `body` | Response body (`on_response_body` only) |

## Built-in interceptors

Plenum includes built-in interceptors that can be referenced by name:

### `internal:auth-apikey`

Validates an API key from a request header against an environment variable:

```yaml
x-plenum-interceptor:
  - module: "internal:auth-apikey"
    hook: on_request_headers
    function: checkApiKey
    options:
      header: "x-api-key"
      envVar: "API_KEY"
    permissions:
      env: ["API_KEY"]
```

Returns `401` if the header is missing or doesn't match.

## Timeouts

Each interceptor can have its own timeout:

```yaml
x-plenum-interceptor:
  - module: "./interceptors/slow-check.js"
    hook: on_request
    function: check
    timeout-ms: 5000  # 5 second timeout for this interceptor
```

The effective timeout is the lesser of the interceptor timeout and the remaining request budget. See [Timeouts](timeouts.md) for details.
