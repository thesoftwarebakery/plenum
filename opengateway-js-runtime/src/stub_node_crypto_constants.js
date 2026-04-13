// Stub for ext:deno_node/internal/crypto/constants.ts.
// deno_crypto's 00_crypto.js imports kKeyObject from this module to tag key
// objects with a private symbol. The symbol only needs to be consistent within
// this runtime; no Node.js interop is required.

const kKeyObject = Symbol("kKeyObject");

export { kKeyObject };
