# Error handling

Plenum returns structured error responses when requests fail at the gateway level. You can customise these responses with a global error interceptor.

> **Working example**: see [`examples/error-handling/`](../examples/error-handling/)
> ```bash
> cd examples/error-handling
> docker compose up
> ```

## Default error responses

| Status | When | Body |
|--------|------|------|
| `404` | No matching route in the spec | `{"error": "not found"}` |
| `405` | Route exists but method not defined | `{"error": "method not allowed"}` |
| `413` | Request body exceeds size limit | `{"error": "request body too large"}` |
| `502` | Upstream connection failed | `{"error": "upstream connection failed"}` |
| `504` | Request timeout exceeded | `{"error": "request timeout exceeded"}` |

The `405` response includes an `Allow` header listing the methods defined for that route.

## Custom error interceptor

Register a global error handler in `x-plenum-config` to customise error responses:

```yaml
x-plenum-config:
  on-gateway-error:
    module: "./interceptors/error-handler.js"
    function: onError
```

The interceptor receives the error details and can modify the status, headers, and body:

```javascript
// interceptors/error-handler.js
export function onError(input) {
  return {
    action: "continue",
    status: input.status,
    headers: {
      "x-error-code": input.error.code,
    },
    body: {
      error: input.error.code,
      message: input.error.message,
    },
  };
}
```

### Error input

The interceptor receives:

| Field | Description |
|-------|-------------|
| `status` | The HTTP status code (404, 413, 502, 504) |
| `error.code` | Machine-readable error code |
| `error.message` | Human-readable description |
| `headers` | Request headers |
| `method` | HTTP method |
| `path` | Request path |
