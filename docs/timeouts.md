# Timeouts and body limits

Plenum enforces request timeouts and body size limits to protect your backends from slow or oversized requests.

> **Working example**: see [`examples/timeouts/`](../examples/timeouts/)
> ```bash
> cd examples/timeouts
> docker compose up
> ```

## Request timeouts

### Global timeout

Set a default timeout for all requests in `x-plenum-config`:

```yaml
x-plenum-config:
  request-timeout-ms: 5000  # 5 seconds
```

If the total request processing (including interceptors and upstream response) exceeds this budget, Plenum returns `504 Gateway Timeout`.

### Per-operation timeout

Override the global timeout on individual operations with `x-plenum-timeout`:

```yaml
paths:
  /reports:
    get:
      operationId: generateReport
      x-plenum-timeout: 30000  # 30 seconds for slow reports
```

### How the budget works

The timeout is a total budget for the entire request lifecycle — interceptors, upstream call, and response processing all share it. If an interceptor takes 2 seconds of a 5 second budget, the upstream call has 3 seconds remaining.

## Body size limits

### Global limit

Set a default maximum request body size in `x-plenum-config`:

```yaml
x-plenum-config:
  max-request-body-bytes: 1048576  # 1 MB
```

Requests exceeding this limit receive `413 Payload Too Large`.

### Per-operation limit

Override the global limit on individual operations with `x-plenum-body-limit`:

```yaml
paths:
  /upload:
    post:
      operationId: uploadFile
      x-plenum-body-limit: 10485760  # 10 MB for uploads
  /config:
    post:
      operationId: updateConfig
      x-plenum-body-limit: 1024      # 1 KB for small payloads
```
