# Plenum

An OpenAPI-first API gateway built on [pingora](https://github.com/cloudflare/pingora). Define your gateway configuration entirely within an OpenAPI spec using `x-plenum-*` extensions, applied via [OpenAPI Overlays](https://github.com/OAI/Overlay-Specification) — no separate gateway config files needed.

## Features

- **OpenAPI as source of truth** — routing, upstream mapping, validation, interceptors, and CORS are all defined in your OpenAPI spec
- **HTTP/HTTPS reverse proxying** — single upstreams or load-balanced pools with round-robin, weighted, and consistent-hashing selection
- **Programmable interceptors** — JavaScript modules hook into five lifecycle phases (on_request_headers, on_request, before_upstream, on_response, on_response_body)
- **Request/response validation** — automatic schema validation against your OpenAPI definitions, configurable per-route
- **Load balancing with health checks** — active and passive health monitoring with automatic backend rotation
- **CORS handling** — per-operation CORS configuration with origin glob matching and preflight support
- **Plugin system** — custom Node.js handlers for non-HTTP upstreams (databases, custom logic)
- **Static responses** — return pre-built responses without hitting an upstream
- **TLS termination** — inbound HTTPS listener and outbound upstream TLS verification
- **Sandboxed execution** — interceptors and plugins run with explicit permission grants (env, filesystem, network)
- **Environment variable substitution** — `${VAR}` and `${VAR:-default}` syntax in config values

## Quick start

Pull the image from GitHub Container Registry:

```bash
docker pull ghcr.io/thesoftwarebakery/plenum
```

Run with your OpenAPI spec and overlays:

```bash
docker run -d \
  -v $(pwd)/config:/config \
  -p 6188:6188 \
  ghcr.io/thesoftwarebakery/plenum \
  --config-path /config \
  --openapi-schema openapi.yaml \
  --openapi-overlay overlay-gateway.yaml,overlay-upstream.yaml
```

Or with environment variables:

```bash
docker run -d \
  -v $(pwd)/config:/config \
  -p 6188:6188 \
  -e PLENUM_CONFIG_PATH=/config \
  -e PLENUM_OPENAPI_SCHEMA=openapi.yaml \
  -e PLENUM_OPENAPI_OVERLAYS=overlay-gateway.yaml,overlay-upstream.yaml \
  ghcr.io/thesoftwarebakery/plenum
```

## Examples

Complete, runnable examples — each with its own `docker-compose.yaml` and README:

| Example | Description |
|---------|-------------|
| [Getting Started](examples/getting-started/) | Basic gateway setup with a WireMock backend |
| [Mock API](examples/mock-api/) | Schema-driven mock responses using json-schema-faker — no backend needed |
| [Auth with SuperTokens](examples/auth-supertokens/) | Authentication flow with session verification, protected routes, and user context propagation |
| [REST Database](examples/rest-database/) | Full CRUD REST API backed by PostgreSQL with pagination, joins, and field mapping |
| [Full Stack](examples/full-stack/) | All features composed: CORS, rate limiting, auth, validation, load balancing, database, static responses |

More single-feature examples covering [CORS](examples/cors/), [interceptors](examples/interceptors/), [load balancing](examples/load-balancing/), [plugins](examples/plugins/), [static responses](examples/static-responses/), [validation](examples/validation/), and others are in the [`examples/`](examples/) directory.

## Documentation

- [Quickstart guide](docs/quickstart.md) — step-by-step setup with configuration reference
- [Writing Plugins](docs/writing-plugins/index.md) — TypeScript setup, bundling, and dependency management

## Contributing

### Project structure

Rust workspace with four crates:

| Crate | Description |
|-------|-------------|
| `plenum-core` | Gateway binary — config parsing, routing, proxying |
| `openapi-overlay` | OpenAPI Overlay spec implementation |
| `plenum-js-runtime` | Out-of-process Node.js runtime for interceptors and plugins |
| `plenum-sandbox` | OS-level sandboxing (bubblewrap on Linux, env filtering elsewhere) |

### Build and test

```bash
# Build
cargo build

# Rust tests
cargo test

# E2E tests (requires Docker)
cd e2e && pnpm install && pnpm test
```

## License

See [LICENSE](LICENSE) for details.
