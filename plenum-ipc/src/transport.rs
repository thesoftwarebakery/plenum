//! Multiplexed transport: routes concurrent frames over a single async stream.
//!
//! # Architecture
//!
//! Two background tasks share a `pending` map (`Arc<Mutex<HashMap<u64, Registration>>>`):
//!
//! ```text
//!  caller A ──send_recv──┐
//!  caller B ──send_recv──┤   cmd_tx (mpsc)    ┌─── writer task ───┐
//!  caller C ─send_stream─┴──────────────────> │ register + write  │──> FramedWrite
//!                                              └───────────────────┘
//!
//!                         pending: Arc<Mutex<HashMap<id, Registration>>>
//!
//!  FramedRead ──────────> ┌─── reader task ───┐
//!                         │ extract id, route  │──> oneshot (A, B) or mpsc (C)
//!                         └───────────────────┘
//! ```
//!
//! The writer inserts into `pending` **before** writing to the socket, so a
//! response can never arrive for an unregistered id.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_util::codec::{FramedRead, FramedWrite};

use crate::codec::MsgpackCodec;
use crate::{Frame, TransportError};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

enum Registration {
    /// Expects a single response frame; resolved once and removed.
    Oneshot(oneshot::Sender<Result<Frame, TransportError>>),
    /// Expects multiple response frames; re-inserted after each successful
    /// dispatch, removed when the receiver is dropped or the connection closes.
    Stream(mpsc::Sender<Result<Frame, TransportError>>),
}

enum Command {
    /// Atomically registers the caller's response channel, then writes the
    /// frame. Doing both in the same task step prevents the race where a
    /// response arrives before registration is recorded.
    SendAndRegister {
        payload: serde_json::Value,
        id: u64,
        reg: Registration,
    },
}

type Pending = Arc<Mutex<HashMap<u64, Registration>>>;

// ---------------------------------------------------------------------------
// Public handle
// ---------------------------------------------------------------------------

/// A cloneable handle to a multiplexed connection.
///
/// Each clone shares the same underlying socket. Frames are routed to
/// callers by the `"id"` field in the response payload.
///
/// Constructed via [`MultiplexedTransport::new`]. The background tasks that
/// drive the connection run until the underlying stream closes or all handles
/// are dropped.
#[derive(Clone)]
pub struct MultiplexedTransport {
    cmd_tx: mpsc::Sender<Command>,
    /// Set to `false` when the reader task detects a closed connection.
    alive: Arc<AtomicBool>,
}

impl MultiplexedTransport {
    /// Wrap `stream` in a multiplexed transport.
    ///
    /// Spawns two background tasks (writer + reader) onto the current Tokio
    /// runtime. The tasks stop when:
    /// - All [`MultiplexedTransport`] handles are dropped (cmd_tx closed), or
    /// - The underlying stream closes or errors (reader exits).
    pub fn new<S>(stream: S) -> Self
    where
        S: AsyncRead + AsyncWrite + Send + 'static,
    {
        let (reader, writer) = tokio::io::split(stream);
        let framed_read = FramedRead::new(reader, MsgpackCodec);
        let framed_write = FramedWrite::new(writer, MsgpackCodec);

        let (cmd_tx, cmd_rx) = mpsc::channel::<Command>(256);
        let alive = Arc::new(AtomicBool::new(true));
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

        tokio::spawn(writer_task(cmd_rx, framed_write, pending.clone()));
        tokio::spawn(reader_task(framed_read, pending, alive.clone()));

        Self { cmd_tx, alive }
    }

    /// Send `frame` and wait for a single response with the same `id`.
    ///
    /// Returns `Err(TransportError::ConnectionClosed)` if the connection
    /// drops before the response arrives.
    pub async fn send_recv(&self, frame: Frame) -> Result<Frame, TransportError> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(Command::SendAndRegister {
                payload: frame.payload,
                id: frame.id,
                reg: Registration::Oneshot(tx),
            })
            .await
            .map_err(|_| TransportError::ConnectionClosed)?;

        rx.await.map_err(|_| TransportError::ConnectionClosed)?
    }

    /// Send `frame` and subscribe to all subsequent responses with the same
    /// `id`.
    ///
    /// Returns a receiver that yields frames as they arrive. The caller is
    /// responsible for detecting the application-level end-of-stream sentinel
    /// (e.g. a `done: true` frame) and dropping the receiver.
    ///
    /// Dropping the receiver deregisters the id from the routing table.
    pub async fn send_stream(
        &self,
        frame: Frame,
    ) -> Result<mpsc::Receiver<Result<Frame, TransportError>>, TransportError> {
        let (tx, rx) = mpsc::channel(32);
        self.cmd_tx
            .send(Command::SendAndRegister {
                payload: frame.payload,
                id: frame.id,
                reg: Registration::Stream(tx),
            })
            .await
            .map_err(|_| TransportError::ConnectionClosed)?;

        Ok(rx)
    }

    /// Returns `false` once the reader task has detected that the underlying
    /// connection is closed. Callers can use this to decide when to reconnect.
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }
}

// ---------------------------------------------------------------------------
// Background tasks
// ---------------------------------------------------------------------------

async fn writer_task<W: AsyncWrite + Send + 'static>(
    mut cmd_rx: mpsc::Receiver<Command>,
    mut sink: FramedWrite<tokio::io::WriteHalf<W>, MsgpackCodec>,
    pending: Pending,
) {
    while let Some(cmd) = cmd_rx.recv().await {
        let Command::SendAndRegister { payload, id, reg } = cmd;

        // Register before writing so no response can arrive unregistered.
        pending.lock().await.insert(id, reg);

        if let Err(e) = sink.send(payload).await {
            // Write failed — remove the registration and notify the caller.
            if let Some(reg) = pending.lock().await.remove(&id) {
                notify_error(reg, e);
            }
        }
    }
    // cmd_rx closed — all handles dropped; writer exits, reader will drain.
}

async fn reader_task<R: AsyncRead + Send + 'static>(
    mut stream: FramedRead<tokio::io::ReadHalf<R>, MsgpackCodec>,
    pending: Pending,
    alive: Arc<AtomicBool>,
) {
    while let Some(result) = stream.next().await {
        match result {
            Ok(value) => {
                let id = match value.get("id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    // Frame has no id — not routable, skip.
                    None => continue,
                };

                // Remove to get ownership; re-insert below for stream registrations.
                let reg = pending.lock().await.remove(&id);

                if let Some(reg) = reg {
                    let frame = Frame { id, payload: value };
                    match reg {
                        Registration::Oneshot(tx) => {
                            let _ = tx.send(Ok(frame));
                        }
                        Registration::Stream(tx) => {
                            // Re-insert the sender so subsequent frames are routed.
                            if tx.send(Ok(frame)).await.is_ok() {
                                pending.lock().await.insert(id, Registration::Stream(tx));
                            }
                            // If send fails the receiver was dropped — stream done.
                        }
                    }
                }
                // Unknown id — no caller registered; ignore the frame.
            }
            Err(e) => {
                // I/O or decode error — drain all pending callers and exit.
                alive.store(false, Ordering::Relaxed);
                drain_pending(&pending, e).await;
                return;
            }
        }
    }

    // Stream ended cleanly (EOF).
    alive.store(false, Ordering::Relaxed);
    drain_pending(&pending, TransportError::ConnectionClosed).await;
}

fn notify_error(reg: Registration, error: TransportError) {
    match reg {
        Registration::Oneshot(tx) => {
            let _ = tx.send(Err(error));
        }
        Registration::Stream(tx) => {
            // try_send is non-blocking; if the channel is full or closed that
            // is fine — dropping tx closes the receiver, signalling end of stream.
            let _ = tx.try_send(Err(error));
        }
    }
}

async fn drain_pending(pending: &Pending, error: TransportError) {
    for (_, reg) in pending.lock().await.drain() {
        notify_error(reg, error.clone());
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use futures::{SinkExt, StreamExt};
    use tokio::net::UnixStream;

    /// Minimal echo server: reads one frame, echoes it back unchanged.
    async fn echo_server(server_stream: UnixStream) {
        let (r, w) = tokio::io::split(server_stream);
        let mut read = FramedRead::new(r, MsgpackCodec);
        let mut write = FramedWrite::new(w, MsgpackCodec);
        while let Some(Ok(frame)) = read.next().await {
            if write.send(frame).await.is_err() {
                break;
            }
        }
    }

    /// Server that echoes the first frame, then sends two extra frames with the
    /// same id (simulating a streaming response: metadata + chunk + done).
    async fn stream_server(server_stream: UnixStream) {
        let (r, w) = tokio::io::split(server_stream);
        let mut read = FramedRead::new(r, MsgpackCodec);
        let mut write = FramedWrite::new(w, MsgpackCodec);
        if let Some(Ok(frame)) = read.next().await {
            let id = frame["id"].as_u64().unwrap();
            // Metadata frame
            let _ = write
                .send(serde_json::json!({ "id": id, "result": { "_stream": true } }))
                .await;
            // Chunk frame
            let _ = write
                .send(serde_json::json!({ "id": id, "result": { "chunk": "hello" } }))
                .await;
            // Done frame
            let _ = write
                .send(serde_json::json!({ "id": id, "result": { "done": true } }))
                .await;
        }
    }

    #[tokio::test]
    async fn send_recv_basic() {
        let (client_stream, server_stream) = UnixStream::pair().unwrap();
        tokio::spawn(echo_server(server_stream));

        let transport = MultiplexedTransport::new(client_stream);
        let frame = Frame {
            id: 1,
            payload: serde_json::json!({ "id": 1u64, "method": "ping", "params": {} }),
        };
        let response = transport.send_recv(frame).await.unwrap();
        assert_eq!(response.id, 1);
        assert_eq!(response.payload["method"], "ping");
    }

    #[tokio::test]
    async fn send_recv_concurrent() {
        let (client_stream, server_stream) = UnixStream::pair().unwrap();
        tokio::spawn(echo_server(server_stream));

        let transport = MultiplexedTransport::new(client_stream);

        // Fire 10 concurrent requests; each must get the response with its own id.
        let handles: Vec<_> = (0u64..10)
            .map(|i| {
                let t = transport.clone();
                tokio::spawn(async move {
                    let frame = Frame {
                        id: i,
                        payload: serde_json::json!({ "id": i, "seq": i }),
                    };
                    t.send_recv(frame).await
                })
            })
            .collect();

        for (i, handle) in handles.into_iter().enumerate() {
            let resp = handle.await.unwrap().unwrap();
            assert_eq!(resp.payload["seq"], i as u64);
        }
    }

    #[tokio::test]
    async fn send_stream_basic() {
        let (client_stream, server_stream) = UnixStream::pair().unwrap();
        tokio::spawn(stream_server(server_stream));

        let transport = MultiplexedTransport::new(client_stream);
        let frame = Frame {
            id: 42,
            payload: serde_json::json!({ "id": 42u64, "method": "stream" }),
        };
        let mut rx = transport.send_stream(frame).await.unwrap();

        let f1 = rx.recv().await.unwrap().unwrap();
        assert_eq!(f1.payload["result"]["_stream"], true);

        let f2 = rx.recv().await.unwrap().unwrap();
        assert_eq!(f2.payload["result"]["chunk"], "hello");

        let f3 = rx.recv().await.unwrap().unwrap();
        assert_eq!(f3.payload["result"]["done"], true);
    }

    #[tokio::test]
    async fn send_stream_and_send_recv_concurrent() {
        // Concurrent streaming + non-streaming on the same transport.
        let (client_stream, server_stream) = UnixStream::pair().unwrap();

        // Server: if id == 99 do echo; if id == 42 do streaming.
        tokio::spawn(async move {
            let (r, w) = tokio::io::split(server_stream);
            let mut read = FramedRead::new(r, MsgpackCodec);
            let mut write = FramedWrite::new(w, MsgpackCodec);

            while let Some(Ok(frame)) = read.next().await {
                let id = frame["id"].as_u64().unwrap();
                if id == 99 {
                    let _ = write
                        .send(serde_json::json!({ "id": 99u64, "result": "pong" }))
                        .await;
                } else {
                    let _ = write
                        .send(serde_json::json!({ "id": id, "result": { "_stream": true } }))
                        .await;
                    let _ = write
                        .send(serde_json::json!({ "id": id, "result": { "chunk": "data" } }))
                        .await;
                    let _ = write
                        .send(serde_json::json!({ "id": id, "result": { "done": true } }))
                        .await;
                }
            }
        });

        let transport = MultiplexedTransport::new(client_stream);

        // Launch streaming + non-streaming concurrently.
        let t1 = transport.clone();
        let streaming = tokio::spawn(async move {
            let mut rx = t1
                .send_stream(Frame {
                    id: 1,
                    payload: serde_json::json!({ "id": 1u64 }),
                })
                .await
                .unwrap();
            let mut frames = vec![];
            while let Some(Ok(f)) = rx.recv().await {
                let done = f.payload["result"]["done"].as_bool() == Some(true);
                frames.push(f);
                if done {
                    break;
                }
            }
            frames
        });

        let t2 = transport.clone();
        let non_streaming = tokio::spawn(async move {
            t2.send_recv(Frame {
                id: 99,
                payload: serde_json::json!({ "id": 99u64 }),
            })
            .await
            .unwrap()
        });

        let stream_frames = streaming.await.unwrap();
        let echo_resp = non_streaming.await.unwrap();

        assert_eq!(stream_frames.len(), 3);
        assert_eq!(echo_resp.payload["result"], "pong");
    }

    #[tokio::test]
    async fn connection_closed_notifies_waiters() {
        let (client_stream, server_stream) = UnixStream::pair().unwrap();

        // Server closes immediately.
        drop(server_stream);

        let transport = MultiplexedTransport::new(client_stream);
        let result = transport
            .send_recv(Frame {
                id: 1,
                payload: serde_json::json!({ "id": 1u64 }),
            })
            .await;

        assert!(result.is_err());
        assert!(!transport.is_alive());
    }

    #[tokio::test]
    async fn is_alive_false_after_connection_close() {
        let (client_stream, server_stream) = UnixStream::pair().unwrap();
        let transport = MultiplexedTransport::new(client_stream);
        assert!(transport.is_alive());

        drop(server_stream);
        // Give the reader task time to detect the closed connection.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert!(!transport.is_alive());
    }
}
