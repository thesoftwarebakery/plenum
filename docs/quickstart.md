# Quickstart

Get Plenum running as an API gateway in front of an HTTP backend.

> **Just want to see it work?** The [getting-started example](../examples/getting-started/) is a self-contained docker-compose you can run immediately:
> ```bash
> cd examples/getting-started
> docker compose up
> curl http://localhost:6188/products
> ```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)

## 1. Define your OpenAPI spec

Plenum uses a standard OpenAPI 3.1 spec as its routing configuration. Create `openapi.yaml`:

```yaml
openapi: 3.1.0
info:
  title: My API
  version: 1.0.0
paths:
  /products:
    get:
      operationId: listProducts
      responses:
        "200":
          description: List of products
  /products/{id}:
    get:
      operationId: getProduct
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: A single product
```

## 2. Create overlays

[OpenAPI Overlays](https://github.com/OAI/Overlay-Specification) inject gateway configuration into your spec without modifying the original document.

### Gateway overlay (`overlay-gateway.yaml`)

```yaml
overlay: 1.1.0
info:
  title: Gateway configuration
  version: 1.0.0
actions:
  - target: $
    update:
      x-plenum-config:
        threads: 1
        listen: "0.0.0.0:6188"
```

### Upstream overlay (`overlay-upstream.yaml`)

```yaml
overlay: 1.1.0
info:
  title: Upstream configuration
  version: 1.0.0
actions:
  - target: $
    update:
      components:
        x-upstreams:
          default:
            kind: "HTTP"
            address: "my-backend"
            port: 3000
  - target: $.paths[*]
    update:
      x-plenum-upstream:
        $ref: "#/components/x-upstreams/default"
```

Replace `my-backend:3000` with your backend's address. When using Docker networking, this is typically the container name or network alias.

## 3. Run

```bash
docker run -d \
  -v $(pwd):/config \
  -p 6188:6188 \
  ghcr.io/thesoftwarebakery/plenum \
  --config-path /config \
  --openapi-schema openapi.yaml \
  --openapi-overlay overlay-gateway.yaml,overlay-upstream.yaml
```

The gateway is now listening on `http://localhost:6188`.

### Environment variables

All CLI flags have environment variable equivalents:

| Flag | Environment variable |
|------|---------------------|
| `--config-path` | `PLENUM_CONFIG_PATH` |
| `--openapi-schema` | `PLENUM_OPENAPI_SCHEMA` |
| `--openapi-overlay` | `PLENUM_OPENAPI_OVERLAYS` |
