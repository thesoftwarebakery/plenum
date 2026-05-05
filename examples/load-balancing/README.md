# Load Balancing

Round-robin load balancing across three WireMock backends with active health checks.

## What it demonstrates

- Multiple backends via `backends[]` array
- `selection: "round-robin"` distributing requests across backends
- Active health checks with configurable path, interval, and failure/success thresholds
- Automatic backend removal when health checks fail

## Architecture

```
Client -> Gateway (6188) -> backend-1 (WireMock)
                         -> backend-2 (WireMock)
                         -> backend-3 (WireMock)
```

Each backend returns a JSON response identifying itself (e.g. `{"backend": "backend-1"}`).

## Setup

```bash
docker compose up -d
```

## Try it out

### Round-robin distribution

Send several requests and observe the responses cycling through backends:

```bash
for i in $(seq 1 6); do
  echo -n "Request $i: "
  curl -s http://localhost:6188/products
  echo
done
```

Each request hits a different backend in round-robin order.

### Health check failover

Stop one backend and verify traffic is redistributed:

```bash
docker compose stop backend-2
```

Wait a few seconds for the health check to detect the failure (configured with `interval-seconds: 2` and `consecutive-failure: 2`), then send requests:

```bash
for i in $(seq 1 4); do
  echo -n "Request $i: "
  curl -s http://localhost:6188/products
  echo
done
```

Responses only come from `backend-1` and `backend-3`. Restart the stopped backend:

```bash
docker compose start backend-2
```

## Cleanup

```bash
docker compose down
```
