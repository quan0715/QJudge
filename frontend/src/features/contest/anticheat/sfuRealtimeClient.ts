import type {
  RealtimeSfuConfigDto,
  RtcSessionDescriptionDto,
} from "@/infrastructure/api/repositories/exam.repository";

export const toSfuSessionDescription = (
  description: RTCSessionDescription | RTCSessionDescriptionInit | null
): RtcSessionDescriptionDto => {
  if (!description?.type || !description.sdp) {
    throw new Error("WebRTC session description is empty");
  }
  return {
    type: description.type as "offer" | "answer",
    sdp: description.sdp,
  };
};

export const createSfuPeerConnection = (
  config: Pick<RealtimeSfuConfigDto, "stun_urls"> | null
) =>
  new RTCPeerConnection({
    iceServers: (config?.stun_urls || []).map((url) => ({ urls: url })),
  });

export const waitForSfuIceGatheringComplete = (peer: RTCPeerConnection) => {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    }, 5000);

    function handleStateChange() {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    }

    peer.addEventListener("icegatheringstatechange", handleStateChange);
  });
};
