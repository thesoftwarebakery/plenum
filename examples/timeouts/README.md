# Timeouts

Global and per-operation request timeouts, plus per-operation body size limits.

## What it demonstrates

- Global request timeout via `request-timeout-ms` in `x-plenum-config` (2000ms)
- Per-operation timeout override via `x-plenum-timeout` (5000ms)
- Per-operation body size limit via `x-plenum-body-limit` (256 bytes)
- 504 Gateway Timeout when a backend exceeds the timeout
- 413 Payload Too Large when a request body exceeds the limit

## Architecture

```
Client -> Gateway (6188) -> WireMock backend
                            /fast      -> responds immediately
                            /slow      -> 3s delay (exceeds 2s global timeout)
                            /slow-with-override -> 3s delay (within 5s override)
                            /upload    -> accepts POST
```

## Setup

```bash
docker compose up -d
```

## Try it out

### Fast endpoint (within timeout)

```bash
curl http://localhost:6188/fast
# {"speed": "fast"}
```

### Slow endpoint (exceeds global timeout)

```bash
curl http://localhost:6188/slow
```

Returns 504 — the backend takes 3 seconds but the global timeout is 2 seconds.

### Slow endpoint with timeout override

```bash
curl http://localhost:6188/slow-with-override
# {"speed": "slow but allowed"}
```

Succeeds because `x-plenum-timeout: 5000` overrides the 2-second global timeout.

### Body size limit (small body)

```bash
curl -X POST http://localhost:6188/upload \
  -H "Content-Type: application/json" \
  -d '{"data": "small"}'
# {"uploaded": true}
```

### Body size limit (oversized body)

```bash
curl -X POST http://localhost:6188/upload \
  -H "Content-Type: application/json" \
  -d '{"data": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
```

Returns 413 — the body exceeds the 256-byte `x-plenum-body-limit`.

## Cleanup

```bash
docker compose down
```
