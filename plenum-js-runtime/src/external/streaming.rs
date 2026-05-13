//! Streaming frame interpreter: maps multiplexed transport frames to StreamChunk.

use std::time::Duration;

use plenum_ipc::{Frame, TransportError};
use tokio::sync::mpsc;

use crate::{JsError, StreamChunk, StreamReceiver};

/// Consume frames from a multiplexed transport receiver and forward them as
/// [`StreamChunk`] items.
///
/// The caller has already consumed the metadata frame (first frame from
/// [`MultiplexedTransport::send_stream`]). This function handles all subsequent
/// frames: `{ result: { chunk: "..." } }`, `{ result: { done: true } }`, and
/// `{ result: { error: "..." } }`.
pub(super) fn map_to_stream_receiver(
    mut rx: mpsc::Receiver<Result<Frame, TransportError>>,
    timeout: Duration,
) -> StreamReceiver {
    let (tx, stream_rx) = tokio::sync::mpsc::channel(32);

    tokio::spawn(async move {
        loop {
            let frame_result = tokio::time::timeout(timeout, rx.recv()).await;

            match frame_result {
                Err(_elapsed) => {
                    let _ = tx.send(Err(JsError::Timeout)).await;
                    break;
                }
                Ok(None) => {
                    // Channel closed — transport dropped without a done frame.
                    let _ = tx
                        .send(Err(JsError::ExecutionError(
                            "stream closed unexpectedly".into(),
                        )))
                        .await;
                    break;
                }
                Ok(Some(Err(e))) => {
                    let _ = tx
                        .send(Err(JsError::ExecutionError(format!(
                            "transport error: {e}"
                        ))))
                        .await;
                    break;
                }
                Ok(Some(Ok(frame))) => {
                    // Frames carry the application result under payload["result"].
                    let result = &frame.payload["result"];

                    if result.get("done").and_then(|v| v.as_bool()) == Some(true) {
                        let _ = tx.send(Ok(StreamChunk::Done)).await;
                        break;
                    }

                    if let Some(err) = result.get("error").and_then(|v| v.as_str()) {
                        let _ = tx.send(Err(JsError::ExecutionError(err.to_string()))).await;
                        break;
                    }

                    let chunk_bytes = result
                        .get("chunk")
                        .and_then(|v| {
                            v.as_str()
                                .map(|s| s.as_bytes().to_vec())
                                .or_else(|| serde_json::to_vec(v).ok())
                        })
                        .unwrap_or_default();

                    if tx.send(Ok(StreamChunk::Chunk(chunk_bytes))).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    stream_rx
}
