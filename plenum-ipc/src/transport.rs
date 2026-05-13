//! Multiplexed transport: routes concurrent frames over a single async stream.
//!
//! # Architecture
//!
//! Two background tasks share a `pending` map (`Arc<DashMap<u64, Registration>>`):
//!
//! ```text
//!  caller A ──send_recv──┐
//!  caller B ──send_recv──┤   cmd_tx (mpsc)    ┌─── writer task ───┐
//!  caller C ─send_stream─┴──────────────────> │ register + write  │──> FramedWrite
//!                                              └───────────────────┘
//!
//!                         pending: Arc<DashMap<id, Registration>>
//!
//!  FramedRead ──────────> ┌─── reader task ───┐
//!                         │ extract id, route  │──> oneshot (A, B) or mpsc (C)
//!                         └───────────────────┘
//! ```
//!
//! The writer inserts into `pending` **before** writing to the socket, so a
//! response can never arrive for an unregistered id.
//!
//! Stream registrations stay in the map permanently (only removed on send
//! failure or connection close). The reader task clones the mpsc sender and
//! drops the DashMap shard lock **before** calling `.await` — holding a
//! DashMap `Ref` across `.await` is unsound (blocks the shard for an
//! unbounded duration).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::{mpsc, oneshot};
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

type Pending = Arc<DashMap<u64, Registration>>;

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
        let pending: Pending = Arc::new(DashMap::new());

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
        // Channel capacity: when full, the reader task blocks on send until
        // the consumer drains it. The reader is shared across all connections
        // so a slow consumer stalls routing for everyone. 32 is sufficient for
        // typical plugin streaming workloads (consumer reads eagerly).
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
        pending.insert(id, reg);

        if let Err(e) = sink.send(payload).await {
            // Write failed — remove the registration and notify the caller.
            if let Some((_, reg)) = pending.remove(&id) {
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

                let frame = Frame { id, payload: value };

                // Peek at the registration type without removing.
                // For Oneshot: remove and resolve once.
                // For Stream: clone the sender, drop the shard lock, then
                // send. Stream registrations stay in the map until the send
                // fails (receiver dropped) or the connection closes.
                //
                // SAFETY: the shard read lock from `pending.get()` must be
                // released (by dropping the Ref) before any `.await` —
                // DashMap's parking_lot guards are blocking and must not be
                // held across yield points.
                if let Some(entry) = pending.get(&id) {
                    match entry.value() {
                        Registration::Oneshot(_) => {
                            drop(entry); // release shard read lock
                            if let Some((_, Registration::Oneshot(tx))) = pending.remove(&id) {
                                let _ = tx.send(Ok(frame));
                            }
                        }
                        Registration::Stream(tx) => {
                            let tx = tx.clone();
                            drop(entry); // release shard read lock before .await
                            if tx.send(Ok(frame)).await.is_err() {
                                // Receiver was dropped — stream complete, clean up.
                                pending.remove(&id);
                            }
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
    // Collect keys first to avoid holding a shard lock during notification
    // (notify_error for Stream entries calls try_send, which is non-blocking,
    // but Oneshot notification is synchronous and safe).
    let keys: Vec<u64> = pending.iter().map(|e| *e.key()).collect();
    for key in keys {
        if let Some((_, reg)) = pending.remove(&key) {
            notify_error(reg, error.clone());
        }
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

    // -----------------------------------------------------------------------
    // Throughput benchmarks — run with:
    //   cargo test --package plenum-ipc -- --nocapture bench_
    // -----------------------------------------------------------------------

    /// Server that echoes every request back unchanged; handles concurrent
    /// requests in a loop.
    async fn echo_server_multi(server_stream: UnixStream) {
        let (r, w) = tokio::io::split(server_stream);
        let mut read = FramedRead::new(r, MsgpackCodec);
        let mut write = FramedWrite::new(w, MsgpackCodec);
        while let Some(Ok(frame)) = read.next().await {
            if write.send(frame).await.is_err() {
                break;
            }
        }
    }

    /// Server that handles multiple sequential streaming requests; sends
    /// `chunks` chunk frames followed by a done frame for each.
    async fn stream_server_with_chunks(server_stream: UnixStream, chunks: usize) {
        let (r, w) = tokio::io::split(server_stream);
        let mut read = FramedRead::new(r, MsgpackCodec);
        let mut write = FramedWrite::new(w, MsgpackCodec);
        while let Some(Ok(frame)) = read.next().await {
            let id = frame["id"].as_u64().unwrap();
            let _ = write
                .send(serde_json::json!({ "id": id, "result": { "_stream": true } }))
                .await;
            for i in 0..chunks {
                let _ = write
                    .send(serde_json::json!({ "id": id, "result": { "chunk": format!("chunk-{i}") } }))
                    .await;
            }
            let _ = write
                .send(serde_json::json!({ "id": id, "result": { "done": true } }))
                .await;
        }
    }

    /// Throughput at varying concurrency levels. Run with `--nocapture` to
    /// see numbers. Useful for before/after comparisons.
    #[tokio::test]
    async fn bench_concurrent_send_recv() {
        let concurrency_levels = [1usize, 10, 50, 100];
        let rounds = 100;

        println!("\n=== bench_concurrent_send_recv ===");
        for &concurrency in &concurrency_levels {
            let (client_stream, server_stream) = UnixStream::pair().unwrap();
            tokio::spawn(echo_server_multi(server_stream));
            let transport = MultiplexedTransport::new(client_stream);

            let start = std::time::Instant::now();
            for round in 0..rounds {
                let handles: Vec<_> = (0..concurrency)
                    .map(|i| {
                        let t = transport.clone();
                        let id = (round * concurrency + i) as u64;
                        tokio::spawn(async move {
                            t.send_recv(Frame {
                                id,
                                payload: serde_json::json!({ "id": id }),
                            })
                            .await
                            .unwrap()
                        })
                    })
                    .collect();
                for h in handles {
                    h.await.unwrap();
                }
            }
            let elapsed = start.elapsed();
            let total = concurrency * rounds;
            println!(
                "  concurrency {:>3}: {:>5} req in {:>8.1?} → {:>9.0} req/s",
                concurrency,
                total,
                elapsed,
                total as f64 / elapsed.as_secs_f64(),
            );
        }
    }

    /// Streaming throughput: sequential streams with varying chunk counts.
    #[tokio::test]
    async fn bench_streaming_throughput() {
        let chunk_counts = [10usize, 50, 100];
        let iterations = 50;

        println!("\n=== bench_streaming_throughput ===");
        for &chunks in &chunk_counts {
            let (client_stream, server_stream) = UnixStream::pair().unwrap();
            tokio::spawn(stream_server_with_chunks(server_stream, chunks));
            let transport = MultiplexedTransport::new(client_stream);

            let start = std::time::Instant::now();
            for i in 0..iterations {
                let mut rx = transport
                    .send_stream(Frame {
                        id: i as u64,
                        payload: serde_json::json!({ "id": i as u64 }),
                    })
                    .await
                    .unwrap();
                // Skip metadata frame.
                let _ = rx.recv().await.unwrap().unwrap();
                let mut received = 0usize;
                while let Some(Ok(f)) = rx.recv().await {
                    if f.payload["result"]["done"].as_bool() == Some(true) {
                        break;
                    }
                    received += 1;
                }
                assert_eq!(received, chunks);
            }
            let elapsed = start.elapsed();
            let total_chunks = chunks * iterations;
            println!(
                "  chunks {:>3}: {:>5} chunks in {:>8.1?} → {:>9.0} chunk/s",
                chunks,
                total_chunks,
                elapsed,
                total_chunks as f64 / elapsed.as_secs_f64(),
            );
        }
    }

    /// Mixed load: interleaved oneshot and streaming requests.
    #[tokio::test]
    async fn bench_mixed_load() {
        let concurrency = 20;
        let rounds = 20;

        println!("\n=== bench_mixed_load (concurrency={concurrency}) ===");

        let (client_stream, server_stream) = UnixStream::pair().unwrap();
        tokio::spawn(async move {
            let (r, w) = tokio::io::split(server_stream);
            let mut read = FramedRead::new(r, MsgpackCodec);
            let mut write = FramedWrite::new(w, MsgpackCodec);
            while let Some(Ok(frame)) = read.next().await {
                let id = frame["id"].as_u64().unwrap();
                if id % 2 == 0 {
                    // Oneshot: echo.
                    let _ = write.send(frame).await;
                } else {
                    // Stream: metadata + 5 chunks + done.
                    let _ = write
                        .send(serde_json::json!({ "id": id, "result": { "_stream": true } }))
                        .await;
                    for i in 0..5usize {
                        let _ = write
                            .send(serde_json::json!({ "id": id, "result": { "chunk": format!("c{i}") } }))
                            .await;
                    }
                    let _ = write
                        .send(serde_json::json!({ "id": id, "result": { "done": true } }))
                        .await;
                }
            }
        });

        let transport = MultiplexedTransport::new(client_stream);

        let start = std::time::Instant::now();
        for round in 0..rounds {
            let mut handles = vec![];
            for i in 0..concurrency {
                let t = transport.clone();
                let id = (round * concurrency + i) as u64;
                handles.push(tokio::spawn(async move {
                    if id % 2 == 0 {
                        t.send_recv(Frame {
                            id,
                            payload: serde_json::json!({ "id": id }),
                        })
                        .await
                        .unwrap();
                    } else {
                        let mut rx = t
                            .send_stream(Frame {
                                id,
                                payload: serde_json::json!({ "id": id }),
                            })
                            .await
                            .unwrap();
                        // Skip metadata.
                        let _ = rx.recv().await.unwrap().unwrap();
                        let mut count = 0usize;
                        while let Some(Ok(f)) = rx.recv().await {
                            if f.payload["result"]["done"].as_bool() == Some(true) {
                                break;
                            }
                            count += 1;
                        }
                        assert_eq!(count, 5);
                    }
                }));
            }
            for h in handles {
                h.await.unwrap();
            }
        }
        let elapsed = start.elapsed();
        let total = concurrency * rounds;
        println!(
            "  {:>5} mixed req in {:>8.1?} → {:>9.0} req/s",
            total,
            elapsed,
            total as f64 / elapsed.as_secs_f64(),
        );
    }
}
