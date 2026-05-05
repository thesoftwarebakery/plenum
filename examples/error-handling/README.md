# Error Handling

Custom gateway error handler that transforms default error responses into structured JSON with error codes.

## What it demonstrates

- `on-gateway-error` in `x-plenum-config` for custom error handling
- JavaScript error handler module receiving `input.status`, `input.error.code`, and `input.error.message`
- Structured error response body with error code, message, and status
- Custom response header (`x-error-code`)
- Timeout-triggered error (backend has a 3-second delay, gateway timeout is 2 seconds)

## Architecture

```
Client -> Gateway (6188) -> WireMock backend (3s delay)
                  |
                  +-- timeout after 2s -> error handler -> structured error response
```

## Setup

```bash
docker compose up -d
```

## Try it out

### Trigger a gateway error

```bash
curl http://localhost:6188/products
```

The backend delays for 3 seconds, exceeding the 2-second gateway timeout. Instead of the default 504 response, the custom error handler returns:

```json
{"error": "gateway_timeout", "message": "request timeout exceeded", "status": 504}
```

Check the custom header:

```bash
curl -v http://localhost:6188/products 2>&1 | grep x-error-code
# x-error-code: gateway_timeout
```

### How it works

The error handler in `interceptors/error-handler.js` receives the error context and returns a structured response:

```js
exports.onError = function onError(input) {
  return {
    action: "continue",
    status: input.status,
    headers: { "x-error-code": input.error.code },
    body: {
      error: input.error.code,
      message: input.error.message,
      status: input.status,
    },
  };
};
```

## Cleanup

```bash
docker compose down
```
