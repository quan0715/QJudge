import { useCallback } from "react";

const MAX_FRAME_BYTES = 80 * 1024;

const canvasToWebpBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode webp blob"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });

const resizeCanvasLongEdge = (source: HTMLCanvasElement, longEdge: number): HTMLCanvasElement => {
  const width = source.width;
  const height = source.height;
  const maxEdge = Math.max(width, height);

  if (!maxEdge || maxEdge <= longEdge) return source;

  const ratio = longEdge / maxEdge;
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(width * ratio));
  target.height = Math.max(1, Math.round(height * ratio));
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }
  return target;
};

export const useCanvasProcessor = () => {
  const encodeUnderBudget = useCallback(async (canvas: HTMLCanvasElement): Promise<Blob> => {
    const qualityChain = [0.7, 0.5, 0.4];
    let best = await canvasToWebpBlob(canvas, qualityChain[0]);
    if (best.size <= MAX_FRAME_BYTES) return best;

    for (const quality of qualityChain.slice(1)) {
      const blob = await canvasToWebpBlob(canvas, quality);
      best = blob;
      if (blob.size <= MAX_FRAME_BYTES) return blob;
    }

    const resized = resizeCanvasLongEdge(canvas, 960);
    if (resized !== canvas) {
      for (const quality of qualityChain) {
        const blob = await canvasToWebpBlob(resized, quality);
        best = blob;
        if (blob.size <= MAX_FRAME_BYTES) return blob;
      }
    }

    return best;
  }, []);

  return { encodeUnderBudget };
};
