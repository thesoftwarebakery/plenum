# Types

Type definitions help catch errors at compile time when writing TypeScript plugins.

## Current status

The `@plenum/types` package is not yet published to npm. Until it is, you can define the types inline in your plugin source.

## Inline type definitions

### Plugin types

```typescript
interface PluginInput {
  request: {
    method: string;
    route: string;
    path: string;
    query: string;
    queryParams: Record<string, unknown>;
    headers: Record<string, string>;
    params: Record<string, unknown>;
  };
  config: unknown;
  operation: Record<string, unknown>;
  ctx: Record<string, unknown>;
  body?: unknown;
}

interface PluginOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
```

### Interceptor types

```typescript
interface RequestInput {
  method: string;
  route: string;
  path: string;
  query: string;
  queryParams: Record<string, unknown>;
  headers: Record<string, string>;
  params: Record<string, unknown>;
  operation: Record<string, unknown>;
  ctx: Record<string, unknown>;
  body?: unknown;
  options?: unknown;
}

interface InterceptorOutput {
  action: "continue" | "respond";
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  ctx?: Record<string, unknown>;
}
```

## Using the types

```typescript
export function handle(input: PluginInput): PluginOutput {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { path: input.request.path },
  };
}
```

## When `@plenum/types` is available

Once published, install it and import directly:

```bash
npm install --save-dev @plenum/types
```

```typescript
import type { PluginInput, PluginOutput } from "@plenum/types";

export function handle(input: PluginInput): PluginOutput {
  // ...
}
```
