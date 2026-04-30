# TLS

Plenum supports TLS for both inbound connections (termination) and outbound upstream connections.

## Inbound TLS (termination)

Accept HTTPS connections by configuring a certificate and key in `x-plenum-config`. Declare your cert and key files in `x-plenum-files`, then reference them with `${{ file.NAME.path }}`:

```yaml
x-plenum-files:
  gateway-cert: /certs/gateway.crt
  gateway-key: /certs/gateway.key

x-plenum-config:
  tls:
    cert: "${{ file.gateway-cert.path }}"
    key: "${{ file.gateway-key.path }}"
    listen: "0.0.0.0:6189"
```

You can also pass paths directly:

```yaml
x-plenum-config:
  tls:
    cert: /certs/gateway.crt
    key: /certs/gateway.key
```

This starts an HTTPS listener on port 6189 alongside the HTTP listener. Both can run simultaneously.

## Outbound TLS (upstream)

Connect to HTTPS backends by setting `tls: true` on the upstream:

```yaml
x-plenum-upstream:
  kind: "HTTP"
  address: "api.example.com"
  port: 443
  tls: true
```

### TLS verification

By default, Plenum verifies upstream TLS certificates against the system trust store. To add a custom CA bundle:

```yaml
x-plenum-files:
  ca-bundle: /certs/ca.crt

x-plenum-config:
  ca: "${{ file.ca-bundle.path }}"
```

Or pass the path directly:

```yaml
x-plenum-config:
  ca: /certs/ca.crt
```

To disable verification for a specific upstream (not recommended for production):

```yaml
x-plenum-upstream:
  kind: "HTTP"
  address: "internal-service"
  port: 443
  tls: true
  tls-verify: false
```
