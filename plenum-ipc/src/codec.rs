//! Length-prefixed MessagePack codec for use with [`tokio_util::codec`].
//!
//! Wire format (both directions):
//! ```text
//! [4-byte big-endian payload length][msgpack payload]
//! ```
//!
//! Payloads are decoded to / encoded from [`serde_json::Value`] using
//! `rmp-serde`. The codec is intentionally unaware of frame structure
//! beyond the length prefix — field interpretation is the caller's concern.

use bytes::{Buf, BufMut, BytesMut};
use tokio_util::codec::{Decoder, Encoder};

use crate::TransportError;

/// Maximum frame payload allowed (10 MB). Frames exceeding this are rejected
/// without reading the payload, matching the limit in the legacy `send_recv`.
pub(crate) const MAX_FRAME_SIZE: usize = 10 * 1024 * 1024;

/// A stateless codec for length-prefixed MessagePack frames.
///
/// One instance is used for reading ([`FramedRead`]) and a separate instance
/// for writing ([`FramedWrite`]) — they share no mutable state.
///
/// [`FramedRead`]: tokio_util::codec::FramedRead
/// [`FramedWrite`]: tokio_util::codec::FramedWrite
#[derive(Default)]
pub(crate) struct MsgpackCodec;

impl Decoder for MsgpackCodec {
    type Item = serde_json::Value;
    type Error = TransportError;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        // Need at least the 4-byte length prefix.
        if src.len() < 4 {
            return Ok(None);
        }

        let payload_len = u32::from_be_bytes([src[0], src[1], src[2], src[3]]) as usize;

        if payload_len > MAX_FRAME_SIZE {
            return Err(TransportError::PayloadTooLarge(payload_len));
        }

        if src.len() < 4 + payload_len {
            // Reserve space so the next read can fill the buffer in one shot.
            src.reserve(4 + payload_len - src.len());
            return Ok(None);
        }

        // Consume the length prefix and extract the payload.
        src.advance(4);
        let payload = src.split_to(payload_len);

        let value: serde_json::Value = rmp_serde::from_slice(&payload)
            .map_err(|e| TransportError::Codec(format!("msgpack decode: {e}")))?;

        Ok(Some(value))
    }
}

impl Encoder<serde_json::Value> for MsgpackCodec {
    type Error = TransportError;

    fn encode(&mut self, item: serde_json::Value, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let payload = rmp_serde::to_vec_named(&item)
            .map_err(|e| TransportError::Codec(format!("msgpack encode: {e}")))?;

        dst.reserve(4 + payload.len());
        dst.put_u32(payload.len() as u32);
        dst.put_slice(&payload);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(value: serde_json::Value) -> serde_json::Value {
        let mut codec = MsgpackCodec;
        let mut buf = BytesMut::new();
        codec.encode(value.clone(), &mut buf).unwrap();

        // Roundtrip: decode should recover the original value.
        let mut codec2 = MsgpackCodec;
        codec2.decode(&mut buf).unwrap().unwrap()
    }

    #[test]
    fn roundtrip_simple_object() {
        let v = serde_json::json!({ "id": 1u64, "method": "handle", "params": {} });
        assert_eq!(roundtrip(v.clone()), v);
    }

    #[test]
    fn roundtrip_nested() {
        let v = serde_json::json!({
            "id": 99u64,
            "result": { "status": 200, "headers": { "content-type": "text/plain" } }
        });
        assert_eq!(roundtrip(v.clone()), v);
    }

    #[test]
    fn decode_incomplete_header_returns_none() {
        let mut codec = MsgpackCodec;
        let mut buf = BytesMut::from(&[0u8, 0, 0][..]);
        assert!(codec.decode(&mut buf).unwrap().is_none());
    }

    #[test]
    fn decode_incomplete_payload_returns_none() {
        let mut codec = MsgpackCodec;
        let mut buf = BytesMut::new();
        // Encode something first to get a valid length prefix.
        MsgpackCodec
            .encode(serde_json::json!({"id": 1u64}), &mut buf)
            .unwrap();
        // Remove the last byte to simulate a partial read.
        buf.truncate(buf.len() - 1);
        assert!(codec.decode(&mut buf).unwrap().is_none());
    }

    #[test]
    fn decode_rejects_oversized_frame() {
        let mut codec = MsgpackCodec;
        let mut buf = BytesMut::new();
        // Write a length prefix claiming 11 MB.
        buf.put_u32((MAX_FRAME_SIZE + 1) as u32);
        let err = codec.decode(&mut buf).unwrap_err();
        assert!(matches!(err, TransportError::PayloadTooLarge(_)));
    }

    #[test]
    fn decode_consumes_exactly_one_frame() {
        let mut codec = MsgpackCodec;
        let mut buf = BytesMut::new();
        MsgpackCodec
            .encode(serde_json::json!({"id": 1u64}), &mut buf)
            .unwrap();
        MsgpackCodec
            .encode(serde_json::json!({"id": 2u64}), &mut buf)
            .unwrap();

        let first = codec.decode(&mut buf).unwrap().unwrap();
        assert_eq!(first["id"], 1u64);
        // Buffer should still contain the second frame.
        assert!(!buf.is_empty());

        let second = codec.decode(&mut buf).unwrap().unwrap();
        assert_eq!(second["id"], 2u64);
        assert!(buf.is_empty());
    }
}
