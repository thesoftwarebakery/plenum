# Load balancing

Plenum can distribute traffic across multiple backends with configurable selection algorithms and health checks.

> **Working example**: see [`examples/load-balancing/`](../examples/load-balancing/)
> ```bash
> cd examples/load-balancing
> docker compose up
> ```

## Configuration

Use `backends` instead of a single `address`/`port` on the upstream:

```yaml
x-plenum-upstream:
  kind: "HTTP"
  selection: "round-robin"
  backends:
    - address: "backend-1"
      port: 8080
    - address: "backend-2"
      port: 8080
    - address: "backend-3"
      port: 8080
```

## Selection algorithms

| Algorithm | Description |
|-----------|-------------|
| `round-robin` | Cycles through backends in order (default) |
| `weighted` | Distributes proportionally based on `weight` |
| `consistent` | Hash-based sticky routing using a request attribute |

### Weighted

Assign a `weight` to each backend. Higher weight means more traffic:

```yaml
backends:
  - address: "primary"
    port: 8080
    weight: 5
  - address: "secondary"
    port: 8080
    weight: 1
```

### Consistent hashing

Route requests with the same attribute to the same backend (useful for caching or session affinity):

```yaml
selection: "consistent"
hash-key: "${{header.x-user-id}}"
```

Supported hash keys:

| Pattern | Source |
|---------|--------|
| `${{header.<name>}}` | Request header |
| `${{query.<name>}}` | Query parameter |
| `${{path-param.<name>}}` | Path parameter |
| `${{cookie.<name>}}` | Cookie value |
| `${{client-ip}}` | Client IP address |

## Health checks

### Active health checks

Periodically probe backends to detect failures before they affect traffic:

```yaml
health-check:
  path: /healthz
  interval-seconds: 10
  expected-status: 200
  consecutive-success: 1
  consecutive-failure: 2
```

| Field | Default | Description |
|-------|---------|-------------|
| `path` | — | Health check endpoint (required) |
| `interval-seconds` | `10` | Seconds between probes |
| `expected-status` | `200` | Expected HTTP status |
| `consecutive-success` | `1` | Successes before marking healthy |
| `consecutive-failure` | `1` | Failures before marking unhealthy |

### Passive health checks

Plenum also tracks proxy failures automatically. Backends that fail repeatedly are temporarily removed from the pool and re-added after a cooldown period. This requires no configuration.
