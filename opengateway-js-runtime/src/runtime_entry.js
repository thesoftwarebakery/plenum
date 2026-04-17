// ESM entry point for the OpenGateway interceptor runtime.
//
// This module imports every ESM file registered by the deno extension crates
// we ship (deno_webidl, deno_web, deno_fetch, deno_crypto) so that deno_core's
// "check_all_modules_evaluated" debug assertion passes at initialisation time.
// The imports are side-effect only: each module sets up its exports on
// globalThis (Event, fetch, crypto, TextEncoder, URL, console, etc.).
//
// Stub modules (deno_net, deno_telemetry, deno_node) are pulled in
// transitively by the real module imports above -- no explicit import needed.

// deno_webidl
import "ext:deno_webidl/00_webidl.js";

// deno_web
import "ext:deno_web/00_infra.js";
import "ext:deno_web/01_dom_exception.js";
import "ext:deno_web/01_mimesniff.js";
import "ext:deno_web/02_event.js";
import "ext:deno_web/02_structured_clone.js";
import { setTimeout, setInterval, clearTimeout, clearInterval } from "ext:deno_web/02_timers.js";

// Import stub node timers to satisfy check_all_modules_evaluated.
// deno_web's 02_timers.js lazy-loads this module when needed.
import "ext:deno_node/internal/timers.mjs";
import "ext:deno_web/03_abort_signal.js";
import "ext:deno_web/04_global_interfaces.js";
import { atob, btoa } from "ext:deno_web/05_base64.js";
import "ext:deno_web/06_streams.js";
import "ext:deno_web/08_text_encoding.js";
import "ext:deno_web/09_file.js";
import "ext:deno_web/10_filereader.js";
import "ext:deno_web/12_location.js";
import "ext:deno_web/13_message_port.js";
import "ext:deno_web/14_compression.js";
import "ext:deno_web/15_performance.js";
import "ext:deno_web/16_image_data.js";
import "ext:deno_web/00_url.js";
import "ext:deno_web/01_urlpattern.js";
import "ext:deno_web/01_console.js";
import "ext:deno_web/01_broadcast_channel.js";

// deno_fetch
import "ext:deno_fetch/20_headers.js";
import "ext:deno_fetch/21_formdata.js";
import "ext:deno_fetch/22_body.js";
import "ext:deno_fetch/22_http_client.js";
import "ext:deno_fetch/23_request.js";
import "ext:deno_fetch/23_response.js";
import { Headers } from "ext:deno_fetch/20_headers.js";
import { Request } from "ext:deno_fetch/23_request.js";
import { Response } from "ext:deno_fetch/23_response.js";
import { fetch } from "ext:deno_fetch/26_fetch.js";
import "ext:deno_fetch/27_eventsource.js";

// deno_crypto
import { crypto } from "ext:deno_crypto/00_crypto.js";

// deno_net: 01_net.js is pulled in by 02_tls.js below. 03_quic.js is
// referenced only by webtransport.js (lazy_loaded_esm in deno_web), so import
// it here to satisfy check_all_modules_evaluated.
import "ext:deno_net/03_quic.js";
import { connect } from "ext:deno_net/01_net.js";
import { startTls } from "ext:deno_net/02_tls.js";

// Named imports for globalThis assignment
import { URL, URLSearchParams } from "ext:deno_web/00_url.js";
import { TextDecoder, TextEncoder } from "ext:deno_web/08_text_encoding.js";

// Expose Web APIs on globalThis so interceptor code can access them without
// explicit imports. The full Deno runtime normally does this in deno_runtime;
// we replicate the minimal subset needed for interceptors.
globalThis.fetch = fetch;
globalThis.Request = Request;
globalThis.Response = Response;
globalThis.Headers = Headers;
globalThis.crypto = crypto;
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.atob = atob;
globalThis.btoa = btoa;
globalThis.setTimeout = setTimeout;
globalThis.setInterval = setInterval;
globalThis.clearTimeout = clearTimeout;
globalThis.clearInterval = clearInterval;

// Expose Deno namespace APIs. Database drivers and their bundled polyfills
// depend on Deno.connect() for TCP, Deno.startTls() for TLS, and Deno.build
// for platform detection.
globalThis.Deno = globalThis.Deno || {};
globalThis.Deno.connect = connect;
globalThis.Deno.startTls = startTls;
globalThis.Deno.build = {
  os: Deno.core.ops.op_build_os(),
  arch: Deno.core.ops.op_build_arch(),
};
globalThis.Deno.env = globalThis.Deno.env || {
  get(key) { return undefined; },
  set(key, value) {},
  toObject() { return {}; },
};
globalThis.Deno.pid = 0;
globalThis.Deno.ppid = 0;
globalThis.Deno.args = [];
globalThis.Deno.mainModule = "file:///opengateway";
globalThis.Deno.cwd = () => "/";
globalThis.Deno.exit = (code) => { throw new Error(`Deno.exit(${code}) called`); };
globalThis.Deno.unrefTimer = () => {};
globalThis.Deno.permissions = { query: async () => ({ state: "granted" }) };

// File system stubs. Database driver dependencies (e.g. std/log) reference
// these during module init but don't require them for actual DB operations.
const fsNotAvailable = () => { throw new Deno.errors.NotFound("filesystem not available"); };
globalThis.Deno.stat = async () => fsNotAvailable();
globalThis.Deno.lstat = async () => fsNotAvailable();
globalThis.Deno.lstatSync = () => fsNotAvailable();
globalThis.Deno.open = async () => fsNotAvailable();
globalThis.Deno.openSync = () => fsNotAvailable();
globalThis.Deno.remove = async () => {};
globalThis.Deno.renameSync = () => {};
globalThis.Deno.close = () => {};
globalThis.Deno.errors = {
  NotFound: class NotFound extends Error {},
  PermissionDenied: class PermissionDenied extends Error {},
  ConnectionRefused: class ConnectionRefused extends Error {},
  ConnectionReset: class ConnectionReset extends Error {},
  InvalidData: class InvalidData extends Error {},
  BadResource: class BadResource extends Error {},
  Interrupted: class Interrupted extends Error {},
  AddrInUse: class AddrInUse extends Error {},
  AddrNotAvailable: class AddrNotAvailable extends Error {},
};
