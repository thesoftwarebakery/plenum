---
name: verify
user-invocable: true
description: Run before declaring work done or when verification is needed. Checks formatting, linting, compilation, codegen, and tests in the correct order.
---

# Verify

Run these checks in order. Stop at the first failure, fix, and restart from that step.

## 1. Install dependencies

```sh
pnpm install
```

Installs all workspace packages (node-runtime, sdk, e2e). Required before `cargo test` — the Rust test suite links against the Node.js runtime.

## 2. Format

```sh
cargo fmt --all -- --check
```

If it fails, run `cargo fmt --all` to fix, then re-check.

## 3. Clippy

```sh
cargo clippy --workspace --locked -- -D warnings
```

`-D warnings` is mandatory — CI treats warnings as errors.

## 4. Unit and integration tests

```sh
cargo test --workspace --locked
```

## 5. Codegen (ts-rs types and fixtures)

Regenerate TypeScript types from Rust structs and compile TS fixture files:

```sh
cd e2e && pnpm run build:types && pnpm run build:fixtures
```

- `build:types` runs `cargo run -p plenum-core --bin export_types` → outputs `sdk/plenum-generated.ts`
- `build:fixtures` runs `tsc -p tsconfig.fixtures.json` → compiles TS fixtures to JS

Run this step whenever Rust structs annotated with `#[derive(TS)]` change, or when e2e fixture `.ts` files are modified.

## 6. E2E tests

```sh
cd e2e && pnpm run test
```

The pretest hook re-runs `build:types` and `build:fixtures` automatically. Tests use testcontainers to build and run the gateway Docker image — no manual `docker build` needed.

Skip only if changes are docs-only or cosmetic.

## When to run what

| Scope of change | Minimum checks |
|---|---|
| Rust code (any crate) | Steps 1–4 |
| Rust structs with `#[derive(TS)]` | Steps 1–5 |
| Interceptors / plugins / JS runtime | Steps 1–6 |
| OpenAPI specs, overlays, e2e fixtures | Steps 1–6 |
| Docs only, no code | None |
| CI config, Dockerfile | Step 6 |
