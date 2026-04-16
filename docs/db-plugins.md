# Database Plugins

Built-in database plugins for PostgreSQL, MySQL, and MongoDB. Define SQL or NoSQL queries directly in your OpenAPI spec and let the gateway execute them.

## Status

Database plugins are implemented at the code level but blocked from production use by a runtime limitation. The embedded `deno_core` JS runtime does not yet support TCP sockets, which database drivers require. The TCP socket implementation exists in `opengateway-js-runtime/src/01_net.js` with corresponding Rust ops in `ops.rs`, but the ops are not yet registered in the runtime extension. See [Runtime Blocker](#runtime-blocker) below.

## Quick Start

Configure a database upstream in your overlay:

```yaml
actions:
  - target: $
    update:
      x-opengateway-upstreams:
        db:
          kind: "plugin"
          plugin: "internal:postgres"
          options:
            host: "${DB_HOST}"
            port: "${DB_PORT:-5432}"
            database: "${DB_NAME}"
            user: "${DB_USER}"
            password: "${DB_PASSWORD}"
  - target: $.paths['/users/{id}'].get
    update:
      x-opengateway-backend:
        query: "SELECT id, name, created_at FROM users WHERE id = ${{path.id}}"
        fields:
          created_at: createdAt
        returns: "/0"
```

## Configuration Reference

### Upstream Configuration

Define database connections under `x-opengateway-upstreams` at the document root. Reference them from operations via `$ref`.

```yaml
x-opengateway-upstreams:
  my-db:
    kind: "plugin"
    plugin: "internal:postgres"
    options:
      host: "${DB_HOST}"
      port: "${DB_PORT:-5432}"
      database: "${DB_NAME}"
      user: "${DB_USER}"
      password: "${DB_PASSWORD}"
      max_connections: 10
      ssl: false
    timeout_ms: 5000
```

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | `"plugin"` | Yes | Must be `"plugin"` for database upstreams |
| `plugin` | string | Yes | Plugin identifier. Currently `"internal:postgres"` |
| `options` | object | Yes | Database-specific connection options |
| `options.host` | string | Yes | Database host address |
| `options.port` | number | Yes | Database port |
| `options.database` | string | Yes | Database name |
| `options.user` | string | Yes | Authentication username |
| `options.password` | string | Yes | Authentication password |
| `options.max_connections` | number | No | Connection pool size (default: driver default) |
| `options.ssl` | boolean | No | Enable TLS connection |
| `timeout_ms` | number | No | Request timeout in milliseconds |
| `permissions` | object | No | JS runtime permissions (see interceptor docs) |

### Backend Configuration

Attach `x-opengateway-backend` to any operation to replace HTTP upstream calls with direct database queries.

```yaml
x-opengateway-backend:
  query: "SELECT * FROM users WHERE id = ${{path.id}}"
  fields:
    created_at: createdAt
    updated_at: updatedAt
  returns: "/0"
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | SQL query with interpolation expressions |
| `fields` | object | No | Column name to output key mapping |
| `returns` | string | No | JSON Pointer (RFC 6901) for response extraction |

### Referencing Shared Upstreams

Define the upstream once, reference it everywhere:

```yaml
# At document root
x-opengateway-upstreams:
  db:
    kind: "plugin"
    plugin: "internal:postgres"
    options:
      host: "${DB_HOST}"
      port: 5432
      database: "${DB_NAME}"
      user: "${DB_USER}"
      password: "${DB_PASSWORD}"

# In each operation
x-opengateway-upstream:
  $ref: "#/x-opengateway-upstreams/db"
```

## Supported Databases

### PostgreSQL

Plugin identifier: `internal:postgres`

Driver: [postgres.js](https://github.com/porsager/postgres) v3.4.8

Connection options:

```yaml
options:
  host: "localhost"
  port: 5432
  database: "mydb"
  user: "admin"
  password: "secret"
  max_connections: 10
  ssl: true
```

The plugin initializes a connection pool on startup and verifies connectivity with `SELECT 1`. The pool is reused across all requests.

### MySQL

Planned. The shared error handling module already defines MySQL error code mappings. Implementation pending.

### MongoDB

Planned. The shared interpolation module includes `interpolateObject` for recursive interpolation of MongoDB filter objects. Implementation pending.

## Query Interpolation

Use `${{namespace.key}}` expressions inside your SQL queries. The engine replaces them with values from the current request.

### Namespaces

| Namespace | Source | Example |
|---|---|---|
| `path` | URL path parameters | `${{path.id}}` from `/users/42` |
| `query` | Query string parameters | `${{query.search}}` from `?search=alice` |
| `body` | Request body fields | `${{body.name}}` from `{"name": "Alice"}` |
| `auth` | Auth context | `${{auth.userId}}` (TBD) |

### Examples

Path parameter:

```yaml
query: "SELECT * FROM users WHERE id = ${{path.id}}"
```

Query string:

```yaml
query: "SELECT * FROM products WHERE name ILIKE ${{query.search}}"
```

Body field:

```yaml
query: "INSERT INTO users (name, email) VALUES (${{body.name}}, ${{body.email}})"
```

Nested body access:

```yaml
query: "SELECT * FROM orders WHERE user_id = ${{body.user.id}}"
```

Multiple interpolations:

```yaml
query: "UPDATE users SET name = ${{body.name}}, email = ${{body.email}} WHERE id = ${{path.id}}"
```

### Value Handling

The interpolation engine handles different value types:

- **Strings**: Wrapped in single quotes with escaped internal quotes (`'O''Brien'`)
- **Numbers**: Inserted directly (`42`)
- **Booleans**: Inserted as `true` or `false`
- **Null/undefined**: Replaced with SQL `null`
- **Objects/arrays**: JSON-stringified and quoted

### Unresolved Variables

If a variable reference cannot be resolved (missing path param, empty query string), it becomes SQL `null`. This prevents syntax errors but may produce unexpected query results. Validate required parameters at the OpenAPI schema level instead.

## Response Shaping

Database query results are arrays of row objects. Use `fields` and `returns` to shape the response for your API consumers.

### Field Mapping

Rename database columns to match your API schema:

```yaml
x-opengateway-backend:
  query: "SELECT id, name, created_at, updated_at FROM users"
  fields:
    created_at: createdAt
    updated_at: updatedAt
```

Input from database:

```json
[
  { "id": 1, "name": "Alice", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-02-01T08:00:00Z" }
]
```

Output after field mapping:

```json
[
  { "id": 1, "name": "Alice", "createdAt": "2024-01-15T10:30:00Z", "updatedAt": "2024-02-01T08:00:00Z" }
]
```

Columns not listed in `fields` pass through unchanged.

### JSON Pointer Extraction

Use `returns` with an RFC 6901 JSON Pointer to extract a specific part of the result:

```yaml
x-opengateway-backend:
  query: "SELECT * FROM users WHERE id = ${{path.id}}"
  returns: "/0"
```

Pointer examples:

| Pointer | Extracts |
|---|---|
| `/0` | First element of the result array |
| `/1` | Second element |
| `/name` | The `name` property of a single object |
| `/0/id` | The `id` property of the first array element |

### Combining Field Mapping and Pointers

Apply both transformations. The pointer extracts first, then field mapping renames columns:

```yaml
x-opengateway-backend:
  query: "SELECT id, name, created_at FROM users WHERE id = ${{path.id}}"
  fields:
    created_at: createdAt
  returns: "/0"
```

Result:

```json
{ "id": 1, "name": "Alice", "createdAt": "2024-01-15T10:30:00Z" }
```

### 404 Handling

When `returns` is specified and the pointer resolves to null (empty result set, out-of-bounds index), the gateway returns HTTP 404 with a null body. This maps naturally to "resource not found" semantics for single-resource endpoints.

## Environment Variables

Use `${VAR_NAME}` syntax in upstream options to read from the environment. Supports shell-style defaults with `${VAR:-default}`.

```yaml
options:
  host: "${DB_HOST}"
  port: "${DB_PORT:-5432}"
  database: "${DB_NAME}"
  user: "${DB_USER}"
  password: "${DB_PASSWORD}"
```

Behavior:

- Set variables are substituted directly
- Unset variables without defaults resolve to empty string with a warning log
- `${VAR:-default}` uses the default when the variable is unset or empty
- Substitution recurses through nested objects and arrays

## Connection Pool Configuration

The PostgreSQL plugin uses a connection pool managed by postgres.js. Configure pool size via `max_connections`:

```yaml
options:
  host: "${DB_HOST}"
  port: 5432
  database: "${DB_NAME}"
  user: "${DB_USER}"
  password: "${DB_PASSWORD}"
  max_connections: 20
```

The pool is created during plugin initialization and verified with `SELECT 1`. If the initial connection fails, the plugin throws an error and the gateway will not start.

Connection pooling is per-plugin-instance. Each upstream definition gets its own pool.

## Error Handling

### HTTP Status Codes

The plugin maps database errors to appropriate HTTP responses:

| Condition | Status | Response Body |
|---|---|---|
| Plugin not initialized | 500 | `{"error": "PostgreSQL plugin not initialized"}` |
| Query execution error | 500 | `{"error": "Query execution failed: ..."}` |
| Pointer resolves to null | 404 | `null` |
| Successful query | 200 | Shaped result |

### Database Error Mapping

The shared error handling module maps specific database errors:

| Database Error | HTTP Status | Message |
|---|---|---|
| Connection refused (ECONNREFUSED) | 503 | Database unavailable |
| Connection timeout (ETIMEDOUT) | 503 | Database connection timed out |
| Authentication failure | 500 | Authentication failed |
| Table/collection not found | 500 | Table or collection not found |
| Unique violation / duplicate key | 409 | Duplicate or conflicting data |
| Foreign key violation | 409 | Referenced record not found |
| NOT NULL violation | 409 | Required field is missing |
| Check constraint violation | 409 | Data validation failed |
| Query timeout | 504 | Query execution timed out |
| Unknown error | 500 | Database error |

### PostgreSQL Error Codes

Specific PostgreSQL error codes recognized:

| Code | Meaning |
|---|---|
| `28P01` | Invalid password (auth failure) |
| `42P01` | Undefined table |
| `23505` | Unique violation |
| `23503` | Foreign key violation |
| `23502` | NOT NULL violation |
| `23514` | Check constraint violation |
| `57014` | Query cancelled (timeout) |

## Runtime Blocker

The database plugin code is complete and tested. However, the gateway cannot execute database queries in production because the embedded `deno_core` JavaScript runtime lacks TCP socket support.

### The Problem

Database drivers like postgres.js need to open TCP connections to the database server. The `deno_core` runtime used by OpenGateway interceptors does not include the `deno_net` extension that provides `Deno.connect()` and related networking APIs.

### What Exists

The TCP socket implementation is partially in place:

- `opengateway-js-runtime/src/01_net.js` provides a `Deno.connect()` API wrapper
- `opengateway-js-runtime/src/ops.rs` defines the Rust ops for TCP operations
- The ops reference `op_net_connect_tcp`, `op_net_read_tcp`, `op_net_write_tcp`, `op_net_close_tcp`

### What Is Missing

The TCP ops are not registered in the runtime extension (`opengateway_runtime_ext` in `ops.rs`). The `deno_net` extension exists as a stub providing only TLS and QUIC placeholders. The TCP ops need to be wired into the runtime with proper resource management and permission checks.

### Path Forward

1. Register TCP ops in `opengateway_runtime_ext` or create a dedicated `deno_net` extension
2. Implement the underlying Rust TCP operations using `tokio::net::TcpStream`
3. Add permission checks for network access (similar to existing `InterceptorPermissions`)
4. Optionally implement TLS support for encrypted database connections
5. Run the existing e2e tests to verify end-to-end functionality

### Testing

The e2e test suite (`e2e/tests/plugin_postgres_test.ts`) covers the full flow with testcontainers. Tests will pass once the runtime blocker is resolved.

Unit tests for the plugin logic exist at `gateway-core/js/src/plugins/postgres_test.ts` and can run independently with Deno.

## File Layout

```
gateway-core/js/src/plugins/
  postgres.ts              # PostgreSQL plugin implementation
  postgres_test.ts         # Plugin unit tests
  shared/
    interpolate.ts         # Query interpolation engine
    shape.ts               # Response shaping (fields + returns)
    errors.ts              # Database error to HTTP status mapping

opengateway-js-runtime/src/
  01_net.js                # Deno.connect() TCP API wrapper
  ops.rs                   # Rust ops for interceptors (TCP ops pending registration)

e2e/
  fixtures/
    openapi-postgres.yaml  # OpenAPI spec for postgres tests
    overlay-postgres.yaml  # Overlay with upstream and backend config
  tests/
    plugin_postgres_test.ts # End-to-end tests with testcontainers
```
