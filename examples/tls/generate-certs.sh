#!/usr/bin/env bash
# Generate a self-signed CA and gateway certificate for the TLS example.
# Certs are written to ./certs/ and valid for 365 days.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"
rm -rf "$CERT_DIR"
mkdir -p "$CERT_DIR"

# CA
openssl req -x509 -newkey rsa:2048 \
  -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
  -days 365 -nodes -subj "/CN=Plenum Example CA"

# Gateway cert config (SAN: localhost + 127.0.0.1)
cat > "$CERT_DIR/gateway.cnf" <<EOF
[req]
req_extensions = v3_req
distinguished_name = req_distinguished_name
[req_distinguished_name]
[v3_req]
subjectAltName = DNS:localhost,IP:127.0.0.1
EOF

# Gateway CSR + signed cert
openssl req -newkey rsa:2048 \
  -keyout "$CERT_DIR/gateway.key" -out "$CERT_DIR/gateway.csr" \
  -nodes -subj "/CN=localhost" -config "$CERT_DIR/gateway.cnf"

openssl x509 -req -in "$CERT_DIR/gateway.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/gateway.crt" -days 365 \
  -extensions v3_req -extfile "$CERT_DIR/gateway.cnf"

# Cleanup intermediate files
rm -f "$CERT_DIR/gateway.csr" "$CERT_DIR/gateway.cnf" "$CERT_DIR/ca.srl"

echo "Certificates generated in $CERT_DIR"
