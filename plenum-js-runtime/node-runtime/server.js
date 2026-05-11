#!/usr/bin/env node
/**
 * Out-of-process plugin server communicating over Unix domain sockets.
 *
 * Protocol: length-prefixed MessagePack
 *   [4-byte big-endian payload length][msgpack payload]
 *
 * Request:  { id: number, method: string, params: any }
 * Response: { id: number, result?: any, error?: string }
 *
 * Usage:
 *   node server.js --socket /tmp/og-plugin-123.sock --plugin ./my-plugin.js
 */

"use strict";

const net = require("net");
const path = require("path");
const fs = require("fs");
const { Packr } = require("msgpackr");

// useRecords: false ensures standard msgpack maps (not msgpackr's custom
// record extension) so rmp_serde on the Rust side can decode them.
const packr = new Packr({ useRecords: false });

// Sanitize values before packing to avoid msgpack extension types (e.g. Date
// becomes a timestamp ext that rmp-serde can't deserialize into serde_json::Value).
const sanitize = (v) => JSON.parse(JSON.stringify(v));
const pack = (v) => packr.pack(sanitize(v));
const unpack = (b) => packr.unpack(b);

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const socketPath = getArg("socket");
const pluginPath = getArg("plugin");

if (!socketPath || !pluginPath) {
  process.stderr.write("Usage: node server.js --socket <path> --plugin <module>\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Plugin loading (supports both CJS require() and ESM import())
// ---------------------------------------------------------------------------

let plugin;

async function loadPlugin(modulePath) {
  const resolved = path.resolve(modulePath);
  const ext = path.extname(resolved).toLowerCase();
  if (ext === ".mjs" || ext === ".cjs") {
    // Force dynamic import for explicit ESM/CJS extensions.
    plugin = await import(resolved);
  } else {
    try {
      plugin = require(resolved);
    } catch (e) {
      if (e.code === "ERR_REQUIRE_ESM") {
        plugin = await import(resolved);
      } else {
        throw e;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// IPC server
// ---------------------------------------------------------------------------

// Track in-flight request count for graceful shutdown.
let inflight = 0;
let shuttingDown = false;
let server;

// Clean up stale socket file from a previous run.
try { fs.unlinkSync(socketPath); } catch {}

function handleConnection(conn) {
  let buffer = Buffer.alloc(0);

  conn.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  async function processBuffer() {
    while (buffer.length >= 4) {
      const payloadLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + payloadLen) break; // incomplete frame

      const payload = buffer.subarray(4, 4 + payloadLen);
      buffer = buffer.subarray(4 + payloadLen);

      let request;
      try {
        request = unpack(payload);
      } catch (e) {
        process.stderr.write(`[plugin:${pluginPath}] Failed to decode msgpack: ${e}\n`);
        continue;
      }

      const { id, method, params } = request;

      // Health check — no plugin call needed.
      if (method === "health") {
        sendResponse(conn, { id, result: { status: "ok" } });
        continue;
      }

      inflight++;
      let response;
      try {
        const fn_ = plugin[method];
        if (typeof fn_ !== "function") {
          response = {
            id,
            error: `function '${method}' not found in plugin exports`,
          };
        } else {
          const result = await fn_(params);

          // Check if the result is an async generator (async function*).
          if (result && typeof result[Symbol.asyncIterator] === "function") {
            // Streaming path: iterate the generator and send multi-frame response.
            const iterator = result[Symbol.asyncIterator]();
            let firstChunk;
            try {
              firstChunk = await iterator.next();
            } catch (e) {
              const msg = e && e.message ? e.message : String(e);
              response = { id, error: `stream metadata error: ${msg}` };
            }

            if (response) {
              // Error occurred getting metadata — fall through to sendResponse.
            } else if (firstChunk.done) {
              // Generator yielded nothing — send empty response.
              response = { id, result: {} };
            } else {
              const meta = firstChunk.value;
              // Send metadata frame with status and headers.
              sendStreamFrame(conn, id, {
                status: meta.status ?? 200,
                headers: meta.headers ?? {},
                _stream: true,
              });

              let streamError = null;
              while (true) {
                let chunk;
                try {
                  chunk = await iterator.next();
                } catch (e) {
                  streamError = e && e.message ? e.message : String(e);
                  break;
                }
                if (chunk.done) break;

                const chunkData = chunk.value.body ?? chunk.value;
                sendRawFrame(conn, { id, result: { chunk: chunkData } });
              }

              if (streamError) {
                // Send error frame then done.
                sendStreamFrame(conn, id, { error: streamError });
              }

              // Send done frame.
              sendStreamFrame(conn, id, { done: true });

              // Suppress the normal sendResponse — we sent everything already.
              response = null;
            }
          } else {
            response = { id, result: result ?? {} };
          }
        }
      } catch (e) {
        const stack = e && e.stack ? e.stack : String(e);
        process.stderr.write(`[plugin:${pluginPath}] Error in '${method}': ${stack}\n`);
        response = { id, error: e && e.message ? e.message : String(e) };
      } finally {
        inflight--;
        checkShutdown();
      }

      if (response !== null) {
        sendResponse(conn, response);
      }
    }
  }

  conn.on("error", (err) => {
    process.stderr.write(`[plugin:${pluginPath}] Connection error: ${err.message}\n`);
  });
}

function sendResponse(conn, response) {
  const respPayload = pack(response);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(respPayload.length, 0);
  conn.write(lenBuf);
  conn.write(respPayload);
}

// Send a streaming frame (metadata, done, or error) via the normal pack+sanitize path.
function sendStreamFrame(conn, id, result) {
  sendResponse(conn, { id, result });
}

// Send a binary-safe frame without sanitize (for chunk data that may contain binary).
function sendRawFrame(conn, rawBody) {
  const respPayload = packr.pack(rawBody);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(respPayload.length, 0);
  conn.write(lenBuf);
  conn.write(respPayload);
}

function checkShutdown() {
  if (shuttingDown && inflight === 0) {
    server.close(() => {
      try { fs.unlinkSync(socketPath); } catch {}
      process.exit(0);
    });
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(signal) {
  process.stderr.write(`[plugin:${pluginPath}] Received ${signal}, shutting down...\n`);
  shuttingDown = true;

  // Stop accepting new connections.
  server.close();

  if (inflight === 0) {
    // Nothing in flight — exit immediately.
    try { fs.unlinkSync(socketPath); } catch {}
    process.exit(0);
  }

  // Wait up to 5 seconds for in-flight requests to complete.
  setTimeout(() => {
    process.stderr.write(`[plugin:${pluginPath}] Shutdown timeout reached, forcing exit\n`);
    try { fs.unlinkSync(socketPath); } catch {}
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

loadPlugin(pluginPath)
  .then(() => {
    server = net.createServer(handleConnection);
    server.listen(socketPath, () => {
      // Signal readiness to the parent Rust process.
      process.stdout.write("ready\n");
    });
  })
  .catch((e) => {
    process.stderr.write(`[plugin:${pluginPath}] Failed to load plugin: ${e.stack || e}\n`);
    process.exit(1);
  });
