# Auth with SuperTokens

A complete authentication flow using [SuperTokens](https://supertokens.com/) as an external auth provider. Demonstrates protected and public routes, session token verification, and user context propagation to upstream services.

## What it demonstrates

- Custom plugin wrapping an external API (SuperTokens CDI)
- Interceptor with outbound `fetch()` for session verification
- `permissions.net` and `permissions.env` for sandboxed network and environment access
- Short-circuit responses (401 Unauthorized)
- User context passing via headers (`x-user-id`)
- Mixed upstreams: plugin (auth), HTTP proxy (protected), static (health)

## Architecture

```
Client → Gateway (6188) → SuperTokens (3567)  [auth plugin]
                        → WireMock (8080)      [protected backend]
                        → static response      [health check]
```

- **SuperTokens** runs in-memory (no database) for simplicity
- The **auth plugin** wraps the SuperTokens Core API for signup and signin
- The **verify-session interceptor** validates Bearer tokens by calling SuperTokens before forwarding requests to the backend
- **WireMock** echoes back the `x-user-id` header to prove the user context was propagated

## Setup

Install dependencies and build the plugin and interceptor:

```bash
npm install
npm run build
```

Start the services:

```bash
docker compose up -d
```

> **Note:** The gateway runs with `privileged: true` because the bubblewrap sandbox (activated by `permissions.net`) requires user namespace creation, which Docker blocks by default. See [#158](https://github.com/thesoftwarebakery/plenum/issues/158) for details.

## Try it out

### 1. Check the public endpoint (no auth required)

```bash
curl http://localhost:6188/public/health
```

### 2. Try accessing a protected endpoint without auth

```bash
curl http://localhost:6188/protected/profile
# → {"error":"Missing or invalid Authorization header"}
```

### 3. Sign up a new user

```bash
curl -X POST http://localhost:6188/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### 4. Sign in to get an access token

```bash
curl -X POST http://localhost:6188/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

Copy the `accessToken` from the response.

### 5. Access the protected endpoint with the token

```bash
curl http://localhost:6188/protected/profile \
  -H "Authorization: Bearer <paste-token-here>"
```

The response includes the `userId` from the session, proving the interceptor extracted it from the token and passed it to the backend via the `x-user-id` header.

### 6. Try with an invalid token

```bash
curl http://localhost:6188/protected/profile \
  -H "Authorization: Bearer invalid-token"
# → {"error":"Invalid or expired session"}
```

## Cleanup

```bash
docker compose down
```
