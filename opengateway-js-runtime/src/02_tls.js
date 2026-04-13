// Stub for ext:deno_net/02_tls.js.
// deno_fetch's 22_http_client.js imports `loadTlsKeyPair` from this module to
// support Deno.createHttpClient() with custom TLS certificates. Interceptors
// in this runtime do not use custom TLS clients, so all exports are stubs that
// throw if called.

function notSupported(name) {
  return function() {
    throw new TypeError(`${name} is not supported in the OpenGateway interceptor runtime`);
  };
}

const connectTls = notSupported("Deno.connectTls");
const listenTls = notSupported("Deno.listenTls");
const startTls = notSupported("Deno.startTls");
const startTlsInternal = notSupported("startTlsInternal");

function hasTlsKeyPairOptions(_options) {
  return false;
}

function loadTlsKeyPair(_api, _options) {
  return null;
}

class TlsConn {}
class TlsListener {}

export {
  connectTls,
  hasTlsKeyPairOptions,
  listenTls,
  loadTlsKeyPair,
  startTls,
  startTlsInternal,
  TlsConn,
  TlsListener,
};
