# E2E Fixtures

Test fixtures for OpenGateway end-to-end tests. Each fixture pair consists of an OpenAPI spec and one or more Overlay files that configure gateway behavior.

## OpenAPI + Overlay Pattern

OpenGateway uses the [OpenAPI Overlay Specification](https://github.com/OAI/Overlay-Specification) to separate the API contract from gateway configuration.

### How It Works

1. **OpenAPI spec** (`openapi-*.yaml`) defines the API contract: paths, operations, parameters, request/response schemas
2. **Overlay** (`overlay-*.yaml`) injects gateway configuration: upstream mappings, interceptor registrations, server settings

This separation means the same OpenAPI spec can be reused across different environments or test scenarios with different overlays.

### Example

```
openapi-postgres.yaml    # API contract: /users CRUD operations
overlay-postgres.yaml    # Gateway config: PostgreSQL upstream, SQL queries
```

The overlay targets specific paths and operations using JSONPath-like selectors:

```yaml
actions:
  - target: $.paths['/users/{id}'].get
    update:
      x-opengateway-backend:
        query: "SELECT * FROM users WHERE id = ${{path.id}}"
```

## Fixture Files

### PostgreSQL Fixtures

#### `openapi-postgres.yaml`

OpenAPI 3.1.0 spec defining a Users API with full CRUD:

| Operation | Method | Path | Description |
|---|---|---|---|
| `listUsers` | GET | `/users` | List all users |
| `createUser` | POST | `/users` | Create a new user |
| `getUser` | GET | `/users/{id}` | Get user by ID |
| `updateUser` | PUT | `/users/{id}` | Update user by ID |
| `deleteUser` | DELETE | `/users/{id}` | Delete user by ID |

Schema:

```yaml
User:
  type: object
  properties:
    id:
      type: integer
    name:
      type: string
    createdAt:
      type: string
      format: date-time
```

#### `overlay-postgres.yaml`

Configures the PostgreSQL upstream and maps each operation to a SQL query.

**Global configuration:**

- Sets server to listen on `0.0.0.0:6188`
- Defines a named upstream `db` using `internal:postgres` plugin
- Connection options use environment variables with defaults

**Per-operation backend mappings:**

| Operation | Query | Response Shaping |
|---|---|---|
| `GET /users` | `SELECT id, name, created_at FROM users ORDER BY id` | `fields: { created_at: createdAt }` |
| `POST /users` | `INSERT INTO users (name, created_at) VALUES ($body.name, NOW()) RETURNING ...` | `fields: { created_at: createdAt }` |
| `GET /users/{id}` | `SELECT id, name, created_at FROM users WHERE id = ${{path.id}}` | `fields: { created_at: createdAt }`, `returns: "/0"` |
| `PUT /users/{id}` | `UPDATE users SET name = ${{body.name}} WHERE id = ${{path.id}} RETURNING ...` | `fields: { created_at: createdAt }`, `returns: "/0"` |
| `DELETE /users/{id}` | `DELETE FROM users WHERE id = ${{path.id}}` | None (returns 200 with no body) |

**Key patterns demonstrated:**

- `$ref` for upstream reuse across all operations
- `${{path.id}}` for path parameter interpolation
- `${{body.name}}` for request body interpolation
- `fields` mapping for column renaming (`created_at` to `createdAt`)
- `returns: "/0"` for extracting single objects from result arrays

### Other Fixtures

| Fixture | Purpose |
|---|---|
| `openapi.yaml` / `overlay-upstream.yaml` | Basic HTTP upstream proxying |
| `openapi-validation.yaml` / `overlay-upstream-validation.yaml` | Request/response validation |
| `openapi-interceptor.yaml` / `overlay-interceptor-*.yaml` | JS interceptor tests (various scenarios) |
| `openapi-plugin.yaml` / `overlay-plugin-*.yaml` | Plugin upstream tests |

## Running Tests

```bash
cd e2e && deno task test
```

Individual test files can be run with:

```bash
cd e2e && deno test tests/plugin_postgres_test.ts --allow-all
```

Tests use testcontainers to spin up isolated PostgreSQL instances and gateway containers for each test case.
