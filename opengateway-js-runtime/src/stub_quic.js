// Stub for ext:deno_net/03_quic.js.
// deno_web's webtransport.js imports QUIC helpers from this module.
// Interceptors do not use WebTransport or QUIC, so stubs that throw on use
// are sufficient.

function notSupported(name) {
  return function () {
    throw new TypeError(`${name} is not supported in the OpenGateway interceptor runtime`);
  };
}

const connectQuic = notSupported("connectQuic");
const webtransportAccept = notSupported("webtransportAccept");
const webtransportConnect = notSupported("webtransportConnect");

export { connectQuic, webtransportAccept, webtransportConnect };
