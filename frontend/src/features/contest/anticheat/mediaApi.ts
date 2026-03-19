type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  successCallback: (stream: MediaStream) => void,
  errorCallback: (error: unknown) => void
) => void;

type LegacyNavigator = Navigator & {
  getUserMedia?: LegacyGetUserMedia;
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
  msGetUserMedia?: LegacyGetUserMedia;
};

const getLegacyGetUserMedia = (): LegacyGetUserMedia | null => {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as LegacyNavigator;
  return (
    nav.getUserMedia ??
    nav.webkitGetUserMedia ??
    nav.mozGetUserMedia ??
    nav.msGetUserMedia ??
    null
  );
};

export const supportsDisplayMediaApi = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
};

export const supportsUserMediaApi = (): boolean => {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.mediaDevices?.getUserMedia === "function") return true;
  return typeof getLegacyGetUserMedia() === "function";
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
  const legacyGetUserMedia = getLegacyGetUserMedia();
  if (!legacyGetUserMedia) {
    throw new Error("getUserMedia unsupported");
  }
  return new Promise<MediaStream>((resolve, reject) => {
    legacyGetUserMedia.call(
      navigator as LegacyNavigator,
      { video: true, audio: false },
      resolve,
      reject
    );
  });
};

