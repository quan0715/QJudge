/** Clone only the video track that LiveKit owns; capture keeps the original. */
export function cloneVideoTrack(originalTrack: MediaStreamTrack): MediaStreamTrack {
  if (originalTrack.kind !== "video" || originalTrack.readyState !== "live") {
    throw new TypeError("A live video source is required");
  }

  return originalTrack.clone();
}
