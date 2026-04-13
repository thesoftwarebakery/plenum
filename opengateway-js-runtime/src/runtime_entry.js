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
import "ext:deno_web/02_timers.js";
import "ext:deno_web/03_abort_signal.js";
import "ext:deno_web/04_global_interfaces.js";
import "ext:deno_web/05_base64.js";
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

// Stub modules: imported here so all loaded ESM modules are evaluated.
// deno_net/02_tls.js and deno_telemetry/* and deno_node/* are pulled in
// transitively by the real imports above. deno_net/03_quic.js is referenced
// only by webtransport.js (lazy_loaded_esm in deno_web), so import it here.
import "ext:deno_net/03_quic.js";

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
