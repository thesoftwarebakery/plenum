// ext:deno_net/02_tls.js for the OpenGateway interceptor runtime.
// Implements Deno.startTls() via op_net_start_tls, which performs the TLS
// handshake in Rust and returns a new TLS stream resource id.
// Other TLS APIs (connectTls, listenTls) are stubbed since interceptors only
// need to upgrade existing TCP connections, not open new TLS ones.
// loadTlsKeyPair must return null -- called by deno_fetch http client setup.

import { TlsConn } from "ext:deno_net/01_net.js";

function notSupported(name) {
  return function () {
    throw new TypeError(
      `${name} is not supported in the OpenGateway interceptor runtime`,
    );
  };
}

const connectTls = notSupported("Deno.connectTls");
const listenTls = notSupported("Deno.listenTls");
const startTlsInternal = notSupported("startTlsInternal");

async function startTls(conn, options = {}) {
  const hostname = options.hostname || conn.remoteAddr?.hostname || "localhost";
  const { rid, localAddr, remoteAddr } =
    await Deno.core.ops.op_net_start_tls(conn.rid, hostname);
  return new TlsConn(rid, localAddr, remoteAddr);
}

function hasTlsKeyPairOptions(_options) {
  return false;
}

function loadTlsKeyPair(_api, _options) {
  return null;
}

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
