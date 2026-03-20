/**
 * Shared MediaStream / MediaStreamTrack health utilities.
 *
 * Canonical source for checking whether a stream or track is usable.
 * Prefer these over inline `stream?.active` or `track.readyState` checks.
 */

export const getPrimaryVideoTrack = (
  stream: MediaStream | null | undefined,
): MediaStreamTrack | null => {
  if (!stream) return null;
  return stream.getVideoTracks?.()[0] ?? null;
};

/**
 * Full health check: stream active + track live + track not muted.
 * Use for webcam where a muted/ended track means the camera is gone.
 */
export const isStreamHealthy = (
  stream: MediaStream | null | undefined,
): boolean => {
  if (!stream?.active) return false;
  const track = getPrimaryVideoTrack(stream);
  if (!track) return false;
  if (track.readyState !== "live") return false;
  if (track.muted) return false;
  return true;
};

/**
 * Lightweight liveness check: stream active + track readyState === "live".
 * Use for screen share where `muted` is not a meaningful signal.
 */
export const isStreamLive = (
  stream: MediaStream | null | undefined,
): boolean => {
  if (!stream?.active) return false;
  const track = getPrimaryVideoTrack(stream);
  return !!track && track.readyState === "live";
};
