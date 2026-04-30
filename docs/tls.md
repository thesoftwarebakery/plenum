# TLS

Plenum supports TLS for both inbound connections (termination) and outbound upstream connections.

## Inbound TLS (termination)

Accept HTTPS connections by configuring a certificate and key in `x-plenum-config`. Declare the cert and key files in `x-plenum-files` and reference them with `${{ file.* }}`:

```yaml
x-plenum-files:
  gateway-cert: /certs/gateway.crt
  gateway-key: /certs/gateway.key

x-plenum-config:
  tls:
    cert-path: "${{ file.gateway-cert }}"
    key-path: "${{ file.gateway-key }}"
    listen: "0.0.0.0:6189"
```

This starts an HTTPS listener on port 6189 alongside the HTTP listener. Both can run simultaneously.

You can also use environment variables for the paths:

```yaml
x-plenum-config:
  tls:
    cert-path: "${{ env.TLS_CERT_PATH }}"
    key-path: "${{ env.TLS_KEY_PATH }}"
    listen: "0.0.0.0:6189"
```

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
  ca-file: "${{ file.ca-bundle }}"
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
