# Interceptor permissions

Interceptors run in a sandboxed environment. By default they have no access to environment variables, the filesystem, or the network. Access must be explicitly granted via `permissions`.

> **Working example**: see [`examples/interceptor-permissions/`](../examples/interceptor-permissions/)
> ```bash
> cd examples/interceptor-permissions
> docker compose up
> ```

## Configuration

Add `permissions` to an interceptor entry:

```yaml
x-plenum-interceptor:
  - module: "./interceptors/auth.js"
    hook: on_request_headers
    function: checkAuth
    permissions:
      env: ["API_KEY", "JWT_SECRET"]
      read: ["/etc/ssl/certs"]
      net: ["auth.internal"]
```

## Permission types

| Type | Grants access to | Example |
|------|-------------------|---------|
| `env` | Environment variables by name | `["API_KEY", "DB_URL"]` |
| `read` | Filesystem paths (read-only) | `["/etc/ssl/certs"]` |
| `net` | Network hosts for outbound requests | `["auth.internal", "api.example.com"]` |

## Environment variables

Without `env` permissions, `process.env` is empty inside the interceptor. Only the listed variable names are visible:

```yaml
permissions:
  env: ["API_KEY"]
```

```javascript
exports.checkAuth = function checkAuth(request) {
  const apiKey = process.env.API_KEY;  // accessible
  const secret = process.env.SECRET;   // undefined (not granted)
  // ...
};
```

## Network access

Interceptors can make outbound HTTP requests (e.g. to an auth service), but only to hosts listed in `net`:

```yaml
permissions:
  net: ["auth-service"]
```

```javascript
exports.checkToken = async function checkToken(request) {
  // Allowed — host is in permissions.net
  const resp = await fetch("http://auth-service:8080/verify", {
    headers: { Authorization: request.headers["authorization"] },
  });

  if (!resp.ok) {
    return { action: "respond", status: 401, body: { error: "Unauthorized" } };
  }
  return { action: "continue" };
};
```

Requests to hosts not listed in `net` will fail.

## What happens without permissions

If an interceptor attempts to access a resource without the corresponding permission:

| Access | Result |
|--------|--------|
| Read env var without `env` | Returns `undefined` |
| Fetch host without `net` | Request fails with an error |
| Read file without `read` | Read fails with an error |

Interceptor errors are logged and result in a `500` response to the client.
