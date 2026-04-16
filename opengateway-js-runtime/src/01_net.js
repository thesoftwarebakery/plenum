// TCP socket support for the OpenGateway JS runtime.
// Provides Deno.connect() backed by tokio::net::TcpStream ops.
// TlsConn is defined here too but its ops live in 02_tls.js (Deno.startTls).

const TCP_OPS = {
  connect: Deno.core.ops.op_net_connect_tcp,
  read: Deno.core.ops.op_net_read_tcp,
  write: Deno.core.ops.op_net_write_tcp,
  close: Deno.core.ops.op_net_close_tcp,
  setNoDelay: Deno.core.ops.op_net_set_nodelay_tcp,
  setKeepAlive: Deno.core.ops.op_net_set_keepalive_tcp,
};

const TLS_OPS = {
  read: Deno.core.ops.op_net_read_tls,
  write: Deno.core.ops.op_net_write_tls,
  close: Deno.core.ops.op_net_close_tls,
};

export class TcpConn {
  #rid;
  #localAddr;
  #remoteAddr;
  #closed = false;
  #ops;

  constructor(rid, localAddr, remoteAddr, ops = TCP_OPS) {
    this.#rid = rid;
    this.#localAddr = localAddr;
    this.#remoteAddr = remoteAddr;
    this.#ops = ops;
  }

  get rid() {
    return this.#rid;
  }

  get localAddr() {
    return this.#localAddr;
  }

  get remoteAddr() {
    return this.#remoteAddr;
  }

  // Read up to buf.length bytes into buf.
  // Returns the number of bytes read, or null on EOF.
  async read(buf) {
    if (this.#closed) return null;
    try {
      const result = await this.#ops.read(this.#rid, buf.length);
      if (result === null || result === undefined) {
        return null;
      }
      const bytes = new Uint8Array(result);
      buf.set(bytes);
      return bytes.length;
    } catch (e) {
      if (this.#closed) return null;
      throw e;
    }
  }

  async write(buf) {
    if (this.#closed) throw new Error("Socket is closed");
    return await this.#ops.write(this.#rid, buf);
  }

  close() {
    if (!this.#closed) {
      this.#closed = true;
      this.#ops.close(this.#rid);
    }
  }

  // Signals end-of-write. For TCP we close the full connection.
  async closeWrite() {
    this.close();
  }

  setNoDelay(nodelay = true) {
    if (this.#ops.setNoDelay) {
      this.#ops.setNoDelay(this.#rid, nodelay);
    }
  }

  setKeepAlive(keepalive = true) {
    if (this.#ops.setKeepAlive) {
      this.#ops.setKeepAlive(this.#rid, keepalive);
    }
  }
}

// TlsConn reuses TcpConn's read/write/close logic but routes to TLS ops.
// The rid is a TlsStreamResource rid, not a TcpStreamResource rid.
export class TlsConn extends TcpConn {
  constructor(rid, localAddr, remoteAddr) {
    super(rid, localAddr, remoteAddr, TLS_OPS);
  }
}

export async function connect(options) {
  const hostname = options.hostname || "127.0.0.1";
  const port = options.port;
  const transport = options.transport || "tcp";

  if (!port) throw new TypeError("Port is required for Deno.connect");
  if (transport !== "tcp") {
    throw new TypeError(
      `Deno.connect transport "${transport}" is not supported; only "tcp" is available`,
    );
  }

  const { rid, localAddr, remoteAddr } = await TCP_OPS.connect(
    hostname,
    port,
  );
  return new TcpConn(rid, localAddr, remoteAddr);
}
