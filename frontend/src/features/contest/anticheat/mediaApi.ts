export const supportsDisplayMediaApi = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
};

export const supportsUserMediaApi = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getUserMedia === "function";
};

export const requestUserMediaVideo = async (): Promise<MediaStream> => {
  if (typeof navigator === "undefined") {
    throw new Error("navigator unavailable");
  }
  if (typeof navigator.mediaDevices?.getUserMedia === "function") {
    return navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
  throw new Error("getUserMedia unsupported");
};
