# Request validation

Plenum validates incoming request bodies against the schemas defined in your OpenAPI spec. Attach the built-in `internal:validate-request` interceptor to an operation and it automatically uses the schema from the spec's `requestBody` — no need to duplicate it.

> **Working example**: see [`examples/validation/`](../examples/validation/)
> ```bash
> cd examples/validation
> docker compose up
> ```

## Configuration

Attach the interceptor to any operation that has a `requestBody` schema:

```yaml
actions:
  - target: "$.paths['/items'].post"
    update:
      x-plenum-interceptor:
        - module: "internal:validate-request"
          hook: "on_request"
          function: "validateRequest"
```

The interceptor reads the schema from the spec's `requestBody.content.application/json.schema` automatically, including `$ref` references to `components/schemas`.

## Behaviour

```bash
# Valid request — proxied to backend
$ curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "quantity": 5}'
# => 201

# Missing required field — rejected by gateway
$ curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget"}'
# => 400 {"type":"request-validation-error","title":"Request Validation Failed",...}

# Wrong type — rejected by gateway
$ curl -X POST http://localhost:6188/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "quantity": "five"}'
# => 400
```

## What gets validated

The interceptor validates against the JSON Schema from the spec, including:

- Required fields
- Type checking (string, integer, boolean, etc.)
- Additional constraints (enum, pattern, min/max, etc.)
- `$ref` references to shared schemas in `components/schemas`

## Overriding the schema

To validate against a different schema than the one in the spec, provide an explicit `options.schema`:

```yaml
x-plenum-interceptor:
  - module: "internal:validate-request"
    hook: "on_request"
    function: "validateRequest"
    options:
      schema:
        type: object
        properties:
          name:
            type: string
          quantity:
            type: integer
        required:
          - name
          - quantity
```

When `options.schema` is provided, it takes precedence over the spec schema.

## Response validation

Plenum also includes `internal:validate-response` for validating upstream responses:

```yaml
x-plenum-interceptor:
  - module: "internal:validate-response"
    hook: "on_response_body"
    function: "validateResponse"
```

This requires `buffer-response: true` on the upstream. It validates the response body against the spec's response schema for the matching status code.
