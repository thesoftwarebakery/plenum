use std::borrow::Cow;
use std::cell::RefCell;
use std::net::SocketAddr;
use std::rc::Rc;
use std::sync::Arc;

use deno_core::{JsBuffer, OpState, Resource, ResourceId, extension, op2};
use deno_error::JsErrorBox;
use deno_tls::{TlsClientConfigOptions, create_client_config};
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::sync::Mutex;
use tokio_rustls::TlsConnector;
use tokio_rustls::client::TlsStream;

use crate::permissions::InterceptorPermissions;

// ── TCP stream resource ────────────────────────────────────────────────────────

struct TcpStreamResource {
    rd: Mutex<OwnedReadHalf>,
    wr: Mutex<OwnedWriteHalf>,
    /// A dup'd std handle to the same socket, used only for set_nodelay /
    /// set_keepalive. Closed (and its dup'd fd released) when the resource drops.
    raw: std::net::TcpStream,
}

impl Resource for TcpStreamResource {
    fn name(&self) -> Cow<'_, str> {
        "tcpStream".into()
    }
}

// ── TLS stream resource ────────────────────────────────────────────────────────

struct TlsStreamResource {
    // Wrapped in a single Mutex. The JS runtime is single-threaded, so concurrent
    // reads and writes from JS are not possible; sequential access is fine.
    // Addresses are returned to JS via ConnectResult and held in the TlsConn
    // object; they do not need to be stored here.
    stream: Mutex<TlsStream<TcpStream>>,
}

impl Resource for TlsStreamResource {
    fn name(&self) -> Cow<'_, str> {
        "tlsStream".into()
    }
}

// ── Serialisable address returned to JS ───────────────────────────────────────

#[derive(Serialize)]
struct AddrJs {
    hostname: String,
    port: u16,
    transport: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectResult {
    rid: u32,
    local_addr: AddrJs,
    remote_addr: AddrJs,
}

fn socket_addr_to_js(addr: SocketAddr) -> AddrJs {
    AddrJs {
        hostname: addr.ip().to_string(),
        port: addr.port(),
        transport: "tcp",
    }
}

/// Build a TLS ClientConfig via deno_tls, which handles Mozilla roots, custom
/// CAs, and client certificates. GeneralSsl = no ALPN (correct for databases).
fn build_tls_config() -> Result<rustls::ClientConfig, deno_tls::TlsError> {
    create_client_config(TlsClientConfigOptions::default())
}

// ── Custom ops ─────────────────────────────────────────────────────────────────

/// Read an environment variable. Requires the variable name to be in the
/// interceptor's allowed_env_vars set.
/// Returns the value as a string, or undefined if the variable is not set.
#[op2]
#[string]
fn op_read_env(state: &mut OpState, #[string] key: String) -> Result<Option<String>, JsErrorBox> {
    let perms = state.borrow::<InterceptorPermissions>();
    perms.check_env(&key).map_err(JsErrorBox::generic)?;
    Ok(std::env::var(&key).ok())
}

/// Read a file from the filesystem. The path must be under one of the
/// interceptor's allowed_read_paths.
#[op2]
#[string]
fn op_read_file(state: &mut OpState, #[string] path: String) -> Result<String, JsErrorBox> {
    let perms = state.borrow::<InterceptorPermissions>();
    let p = std::path::Path::new(&path);
    perms.check_read(p).map_err(JsErrorBox::generic)?;
    std::fs::read_to_string(p).map_err(|e| JsErrorBox::generic(format!("read_file failed: {e}")))
}

// ── TCP ops ────────────────────────────────────────────────────────────────────

/// Establish a TCP connection. Checks `allowed_hosts` before connecting.
/// Returns `{rid, localAddr, remoteAddr}`.
#[op2]
#[serde]
async fn op_net_connect_tcp(
    state: Rc<RefCell<OpState>>,
    #[string] hostname: String,
    #[smi] port: u32,
) -> Result<ConnectResult, JsErrorBox> {
    let perms = {
        let s = state.borrow();
        s.borrow::<InterceptorPermissions>().clone()
    };
    perms
        .check_net(&hostname, Some(port as u16))
        .map_err(JsErrorBox::generic)?;

    let addr_str = format!("{hostname}:{port}");
    let stream = TcpStream::connect(&addr_str)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TCP connect to {addr_str} failed: {e}")))?;

    let local_addr = stream
        .local_addr()
        .map_err(|e| JsErrorBox::generic(format!("local_addr: {e}")))?;
    let remote_addr = stream
        .peer_addr()
        .map_err(|e| JsErrorBox::generic(format!("peer_addr: {e}")))?;

    // Obtain a dup'd std TcpStream for socket option access, then split the
    // original into owned halves.
    let raw = stream
        .into_std()
        .map_err(|e| JsErrorBox::generic(format!("into_std: {e}")))?;
    let raw_dup = raw
        .try_clone()
        .map_err(|e| JsErrorBox::generic(format!("try_clone: {e}")))?;
    let tokio_stream =
        TcpStream::from_std(raw).map_err(|e| JsErrorBox::generic(format!("from_std: {e}")))?;
    let (rd, wr) = tokio_stream.into_split();

    let resource = TcpStreamResource {
        rd: Mutex::new(rd),
        wr: Mutex::new(wr),
        raw: raw_dup,
    };
    let rid = state.borrow_mut().resource_table.add(resource);

    Ok(ConnectResult {
        rid,
        local_addr: socket_addr_to_js(local_addr),
        remote_addr: socket_addr_to_js(remote_addr),
    })
}

/// Read up to `max_len` bytes from a TCP stream.
/// Returns null on EOF, a Uint8Array otherwise.
#[op2]
#[buffer]
async fn op_net_read_tcp(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[smi] max_len: u32,
) -> Result<Option<Vec<u8>>, JsErrorBox> {
    let resource = state
        .borrow()
        .resource_table
        .get::<TcpStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TCP stream rid"))?;

    let mut buf = vec![0u8; max_len as usize];
    let n = resource
        .rd
        .lock()
        .await
        .read(&mut buf)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TCP read: {e}")))?;

    if n == 0 {
        Ok(None)
    } else {
        buf.truncate(n);
        Ok(Some(buf))
    }
}

/// Write bytes to a TCP stream. Returns the number of bytes written.
#[op2]
#[smi]
async fn op_net_write_tcp(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[buffer] data: JsBuffer,
) -> Result<u32, JsErrorBox> {
    let resource = state
        .borrow()
        .resource_table
        .get::<TcpStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TCP stream rid"))?;

    let len = data.len() as u32;
    resource
        .wr
        .lock()
        .await
        .write_all(&data)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TCP write: {e}")))?;

    Ok(len)
}

/// Close a TCP stream and remove it from the resource table.
#[op2(fast)]
fn op_net_close_tcp(state: &mut OpState, #[smi] rid: ResourceId) -> Result<(), JsErrorBox> {
    state
        .resource_table
        .take::<TcpStreamResource>(rid)
        .map(|_| ())
        .map_err(|e| JsErrorBox::generic(format!("close TCP: {e}")))
}

/// Set TCP_NODELAY on a TCP stream.
#[op2(fast)]
fn op_net_set_nodelay_tcp(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    nodelay: bool,
) -> Result<(), JsErrorBox> {
    let resource = state
        .resource_table
        .get::<TcpStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TCP stream rid"))?;
    resource
        .raw
        .set_nodelay(nodelay)
        .map_err(|e| JsErrorBox::generic(format!("set_nodelay: {e}")))
}

/// Set SO_KEEPALIVE on a TCP stream.
#[op2(fast)]
fn op_net_set_keepalive_tcp(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    keepalive: bool,
) -> Result<(), JsErrorBox> {
    let resource = state
        .resource_table
        .get::<TcpStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TCP stream rid"))?;
    // std::net::TcpStream doesn't have set_keepalive; use socket2.
    use socket2::SockRef;
    SockRef::from(&resource.raw)
        .set_keepalive(keepalive)
        .map_err(|e| JsErrorBox::generic(format!("set_keepalive: {e}")))
}

// ── TLS ops ────────────────────────────────────────────────────────────────────

/// Upgrade a TCP connection to TLS (Deno.startTls). Consumes the TCP rid and
/// returns a new TLS rid after completing the TLS handshake.
#[op2]
#[serde]
async fn op_net_start_tls(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[string] hostname: String,
) -> Result<ConnectResult, JsErrorBox> {
    // Get the resource, then close (remove) it so we can take ownership.
    let resource: Rc<TcpStreamResource> = {
        let s = state.borrow();
        s.resource_table
            .get::<TcpStreamResource>(rid)
            .map_err(|_| JsErrorBox::type_error("invalid TCP stream rid for TLS upgrade"))?
    };
    state
        .borrow_mut()
        .resource_table
        .take::<TcpStreamResource>(rid)
        .map_err(|e| JsErrorBox::generic(format!("remove TCP resource for TLS upgrade: {e}")))?;

    let inner = Rc::try_unwrap(resource)
        .map_err(|_| JsErrorBox::generic("TCP stream still in use during TLS upgrade"))?;

    let local_addr = inner
        .raw
        .local_addr()
        .map_err(|e| JsErrorBox::generic(format!("local_addr: {e}")))?;
    let remote_addr = inner
        .raw
        .peer_addr()
        .map_err(|e| JsErrorBox::generic(format!("remote_addr: {e}")))?;

    // Reassemble the TcpStream from its halves.
    let rd = inner.rd.into_inner();
    let wr = inner.wr.into_inner();
    let tcp_stream = rd
        .reunite(wr)
        .map_err(|_| JsErrorBox::generic("failed to reunite TCP halves for TLS upgrade"))?;

    // Build TLS config and perform the handshake.
    let tls_config =
        build_tls_config().map_err(|e| JsErrorBox::generic(format!("TLS config: {e}")))?;
    let connector = TlsConnector::from(Arc::new(tls_config));
    let server_name = rustls::pki_types::ServerName::try_from(hostname.clone())
        .map_err(|e| JsErrorBox::generic(format!("invalid TLS hostname '{hostname}': {e}")))?;
    let tls_stream = connector
        .connect(server_name, tcp_stream)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TLS handshake: {e}")))?;

    let resource = TlsStreamResource {
        stream: Mutex::new(tls_stream),
    };
    let new_rid = state.borrow_mut().resource_table.add(resource);

    Ok(ConnectResult {
        rid: new_rid,
        local_addr: socket_addr_to_js(local_addr),
        remote_addr: socket_addr_to_js(remote_addr),
    })
}

/// Read up to `max_len` bytes from a TLS stream.
/// Returns null on EOF, a Uint8Array otherwise.
#[op2]
#[buffer]
async fn op_net_read_tls(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[smi] max_len: u32,
) -> Result<Option<Vec<u8>>, JsErrorBox> {
    let resource = state
        .borrow()
        .resource_table
        .get::<TlsStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TLS stream rid"))?;

    let mut buf = vec![0u8; max_len as usize];
    let n = resource
        .stream
        .lock()
        .await
        .read(&mut buf)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TLS read: {e}")))?;

    if n == 0 {
        Ok(None)
    } else {
        buf.truncate(n);
        Ok(Some(buf))
    }
}

/// Write bytes to a TLS stream. Returns the number of bytes written.
#[op2]
#[smi]
async fn op_net_write_tls(
    state: Rc<RefCell<OpState>>,
    #[smi] rid: ResourceId,
    #[buffer] data: JsBuffer,
) -> Result<u32, JsErrorBox> {
    let resource = state
        .borrow()
        .resource_table
        .get::<TlsStreamResource>(rid)
        .map_err(|_| JsErrorBox::type_error("invalid TLS stream rid"))?;

    let len = data.len() as u32;
    resource
        .stream
        .lock()
        .await
        .write_all(&data)
        .await
        .map_err(|e| JsErrorBox::generic(format!("TLS write: {e}")))?;

    Ok(len)
}

/// Close a TLS stream and remove it from the resource table.
#[op2(fast)]
fn op_net_close_tls(state: &mut OpState, #[smi] rid: ResourceId) -> Result<(), JsErrorBox> {
    state
        .resource_table
        .take::<TlsStreamResource>(rid)
        .map(|_| ())
        .map_err(|e| JsErrorBox::generic(format!("close TLS: {e}")))
}

// ── Stub extensions for deno_fetch / deno_web ──────────────────────────────────

// Stub extension named "deno_net" that provides ext:deno_net/01_net.js,
// ext:deno_net/02_tls.js and ext:deno_net/03_quic.js.
// deno_fetch imports loadTlsKeyPair from 02_tls.js; deno_web's webtransport.js
// imports QUIC helpers from 03_quic.js. Must come before deno_fetch.
extension!(
    deno_net,
    esm = [
        "ext:deno_net/01_net.js" = "src/01_net.js",
        "ext:deno_net/02_tls.js" = "src/02_tls.js",
        "ext:deno_net/03_quic.js" = "src/stub_quic.js",
    ],
);

// Stub extension named "deno_telemetry" that provides ext:deno_telemetry/telemetry.ts
// and ext:deno_telemetry/util.ts. deno_fetch's 26_fetch.js imports tracing symbols
// from these modules. With TRACING_ENABLED=false the tracing paths are bypassed
// so all exports beyond that flag are safe no-ops. Must come before deno_fetch.
extension!(
    deno_telemetry,
    esm = [
        "ext:deno_telemetry/telemetry.ts" = "src/stub_telemetry.js",
        "ext:deno_telemetry/util.ts" = "src/stub_telemetry_util.js",
    ],
);

// Stub extension named "deno_node" providing the minimal subset of Node.js compat
// modules referenced at startup by deno_crypto. The kKeyObject symbol only needs to
// be consistent within this runtime; no Node.js interop is required.
extension!(
    deno_node,
    esm = ["ext:deno_node/internal/crypto/constants.ts" = "src/stub_node_crypto_constants.js",],
);

extension!(
    opengateway_runtime_ext,
    deps = [deno_web],
    ops = [
        op_read_env,
        op_read_file,
        op_net_connect_tcp,
        op_net_read_tcp,
        op_net_write_tcp,
        op_net_close_tcp,
        op_net_set_nodelay_tcp,
        op_net_set_keepalive_tcp,
        op_net_start_tls,
        op_net_read_tls,
        op_net_write_tls,
        op_net_close_tls,
    ],
    esm_entry_point = "ext:opengateway_runtime_ext/runtime_entry.js",
    esm = ["ext:opengateway_runtime_ext/runtime_entry.js" = "src/runtime_entry.js"],
    js = ["src/runtime_api.js"],
);
