//! Streaming IPC helpers: reading multi-frame responses and managing stream setup.

use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::net::UnixStream;

use crate::{CallOutput, JsError, StreamChunk, StreamReceiver};

use super::{Connection, ExternalRuntime, PluginRequest};

/// Serialize a `PluginRequest` and write it as a length-prefixed msgpack frame.
pub(super) async fn write_request(
    stream: &mut UnixStream,
    request: &PluginRequest,
) -> Result<(), JsError> {
    let payload = rmp_serde::to_vec_named(request)
        .map_err(|e| JsError::ExecutionError(format!("msgpack encode error: {e}")))?;

    stream
        .write_all(&(payload.len() as u32).to_be_bytes())
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket write error: {e}")))?;
    stream
        .write_all(&payload)
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket write error: {e}")))?;
    stream
        .flush()
        .await
        .map_err(|e| JsError::ExecutionError(format!("socket flush error: {e}")))?;

    Ok(())
}

/// Spawn a background task that reads multi-frame msgpack responses from a
/// UnixStream and feeds them as `StreamChunk` items into an mpsc channel.
pub(super) fn spawn_stream_reader(
    stream: UnixStream,
    id: u64,
    timeout: Duration,
) -> StreamReceiver {
    let (tx, rx) = tokio::sync::mpsc::channel(32);

    tokio::spawn(async move {
        let mut stream = stream;
        let mut stream_active = true;

        while stream_active {
            let chunk_result = tokio::time::timeout(timeout, async {
                ExternalRuntime::read_frame(&mut stream, id).await
            })
            .await;

            match chunk_result {
                Ok(Ok(value)) => {
                    if value
                        .as_object()
                        .and_then(|m| m.get("done"))
                        .and_then(|v| v.as_bool())
                        == Some(true)
                    {
                        let _ = tx.send(Ok(StreamChunk::Done)).await;
                        stream_active = false;
                    } else {
                        let chunk_bytes = value
                            .as_object()
                            .and_then(|m| m.get("chunk"))
                            .and_then(|v| {
                                v.as_str()
                                    .map(|s| s.as_bytes().to_vec())
                                    .or_else(|| serde_json::to_vec(v).ok())
                            })
                            .unwrap_or_default();

                        if tx.send(Ok(StreamChunk::Chunk(chunk_bytes))).await.is_err() {
                            stream_active = false;
                        }
                    }
                }
                Ok(Err(e)) => {
                    let _ = tx.send(Err(e)).await;
                    stream_active = false;
                }
                Err(_elapsed) => {
                    let _ = tx.send(Err(JsError::Timeout)).await;
                    stream_active = false;
                }
            }
        }
    });

    rx
}

/// Take ownership of the Unix stream from a locked connection, release the
/// lock, and spawn a background reader that feeds chunks into an mpsc channel.
/// Shared by the success and retry paths of `call_stream`.
pub(super) fn finish_stream_setup(
    mut conn: tokio::sync::MutexGuard<'_, Connection>,
    call_output: CallOutput,
    id: u64,
    timeout: Duration,
) -> Result<(CallOutput, StreamReceiver), JsError> {
    let stream = conn
        .stream
        .take()
        .ok_or_else(|| JsError::ExecutionError("stream already taken".into()))?;
    drop(conn);
    let rx = spawn_stream_reader(stream, id, timeout);
    Ok((call_output, rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[tokio::test]
    async fn write_request_produces_valid_length_prefixed_msgpack() {
        // Create a connected pair of Unix streams.
        let (mut writer, mut reader) = UnixStream::pair().unwrap();

        let request = PluginRequest {
            id: 42,
            method: "test".to_string(),
            params: serde_json::json!({"key": "value"}),
        };

        write_request(&mut writer, &request).await.unwrap();

        // Read the length prefix.
        let mut len_buf = [0u8; 4];
        reader.read_exact(&mut len_buf).await.unwrap();
        let len = u32::from_be_bytes(len_buf) as usize;
        assert!(len > 0);

        // Read and decode the payload.
        let mut payload = vec![0u8; len];
        reader.read_exact(&mut payload).await.unwrap();

        let decoded: PluginRequest = rmp_serde::from_slice(&payload).unwrap();
        assert_eq!(decoded.id, 42);
        assert_eq!(decoded.method, "test");
    }
}
