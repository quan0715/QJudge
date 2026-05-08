import { useEffect, useState } from "react";
import jsQR from "jsqr";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export type ScannerMode = "waiting" | "native" | "js";

type Options = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetected: (raw: string) => void;
};

async function createNativeQrDetector(): Promise<BarcodeDetectorLike | null> {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!ctor) return null;
  try {
    const supported = typeof ctor.getSupportedFormats === "function"
      ? await ctor.getSupportedFormats()
      : [];
    if (supported.length > 0 && !supported.includes("qr_code")) return null;
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function decodeFromVideoFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) return "";
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.floor(video.videoWidth * scale));
  const height = Math.max(1, Math.floor(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return jsQR(imageData.data, width, height)?.data || "";
}

export function useQrScanner({ videoRef, active, onDetected }: Options): ScannerMode {
  const [mode, setMode] = useState<ScannerMode>("waiting");

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to waiting when scanning is paused
      setMode("waiting");
      return undefined;
    }
    let detector: BarcodeDetectorLike | null = null;
    let stopped = false;
    let timer = 0;

    void createNativeQrDetector().then((next) => {
      if (stopped) return;
      detector = next;
      setMode(next ? "native" : "js");
    });

    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const raw = detector
        ? (await detector.detect(video).catch(() => []))?.[0]?.rawValue
        : decodeFromVideoFrame(video);
      if (raw) {
        stopped = true;
        window.clearInterval(timer);
        onDetected(raw);
      }
    };

    timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, 500);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [active, onDetected, videoRef]);

  return mode;
}
