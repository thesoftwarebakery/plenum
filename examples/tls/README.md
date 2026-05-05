# TLS

Inbound TLS termination — the gateway accepts both HTTP and HTTPS connections, proxying requests to a plain HTTP backend.

## What it demonstrates

- TLS configuration via `x-plenum-config.tls`
- Certificate and key paths using `x-plenum-files` + `${{ file.NAME.path }}` interpolation
- Dual listeners: HTTP on port 6188, HTTPS on port 6189
- Self-signed CA and gateway certificate generation

## Architecture

```
Client (HTTP)  -> Gateway :6188 -> WireMock backend
Client (HTTPS) -> Gateway :6189 -> WireMock backend
```

## Setup

Generate the self-signed certificates:

```bash
./generate-certs.sh
```

This creates `certs/ca.crt`, `certs/ca.key`, `certs/gateway.crt`, and `certs/gateway.key`.

Start the services:

```bash
docker compose up -d
```

## Try it out

### HTTP request

```bash
curl http://localhost:6188/products
# [{"id": 1, "name": "Widget"}, {"id": 2, "name": "Gadget"}]
```

### HTTPS request with CA verification

```bash
curl --cacert certs/ca.crt https://localhost:6189/products
# [{"id": 1, "name": "Widget"}, {"id": 2, "name": "Gadget"}]
```

### HTTPS request (skip verification)

```bash
curl -k https://localhost:6189/products
```

Both listeners proxy to the same WireMock backend over plain HTTP.

## Cleanup

```bash
docker compose down
```
