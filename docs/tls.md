# TLS

Plenum supports TLS for both inbound connections (termination) and outbound upstream connections.

## Inbound TLS (termination)

Accept HTTPS connections by configuring a certificate and key in `x-plenum-config`:

```yaml
x-plenum-config:
  tls:
    cert-path: /certs/gateway.crt
    key-path: /certs/gateway.key
    listen: "0.0.0.0:6189"
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
x-plenum-config:
  ca-file: /certs/ca.crt
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
