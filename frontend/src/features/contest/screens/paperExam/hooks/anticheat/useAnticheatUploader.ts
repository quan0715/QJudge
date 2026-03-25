import { useCallback, useRef } from "react";
import {
  getAnticheatUrls,
  uploadAnticheatBatch,
} from "@/infrastructure/api/repositories/exam.repository";
import type { AnticheatUploadBatchItem } from "@/infrastructure/api/repositories/exam.repository";

export const useAnticheatUploader = (
  contestId: string,
  module: "screen_share" | "webcam" = "screen_share"
) => {
  const PREFETCH_BATCH_SIZE = 30;
  const PREFETCH_LOW_WATERMARK = 5;
  const urlPoolRef = useRef<{
    sessionId: string | null;
    items: Array<{ put_url: string; required_headers?: Record<string, string> }>;
  }>({
    sessionId: null,
    items: [],
  });

  const refillPool = useCallback(
    async (sessionId: string, requiredCount: number) => {
      if (urlPoolRef.current.sessionId !== sessionId) {
        urlPoolRef.current.sessionId = sessionId;
        urlPoolRef.current.items = [];
      }

      while (urlPoolRef.current.items.length < requiredCount) {
        const fetchCount = Math.max(PREFETCH_BATCH_SIZE, requiredCount);
        const response = await getAnticheatUrls(contestId, fetchCount, {
          upload_session_id: sessionId,
          module,
        });
        const fetched = response.items.map((item) => ({
          put_url: item.put_url,
          required_headers: item.required_headers,
        }));
        urlPoolRef.current.items.push(...fetched);
        if (fetched.length === 0) break;
      }
    },
    [contestId, module]
  );

  const uploadBatch = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string,
      onProgress?: (count: number) => void
    ): Promise<number[]> => {
      if (!items.length) return [];

      try {
        await refillPool(sessionId, items.length);

        const poolItems = urlPoolRef.current.items.splice(0, items.length);
        if (poolItems.length === 0) {
          throw new Error("No anticheat upload URLs available");
        }

        const uploadPayload: AnticheatUploadBatchItem[] = items
          .slice(0, poolItems.length)
          .map((item, idx) => ({
          blob: item.blob,
          put_url: poolItems[idx].put_url,
          required_headers: poolItems[idx].required_headers,
        }));

        await uploadAnticheatBatch(uploadPayload);
        const uploadedCount = uploadPayload.length;
        onProgress?.(uploadedCount);

        if (urlPoolRef.current.items.length < PREFETCH_LOW_WATERMARK) {
          // Best effort background refill to avoid blocking the next upload cycle.
          void refillPool(sessionId, PREFETCH_BATCH_SIZE).catch(() => undefined);
        }

        return items.slice(0, uploadedCount).map((i) => i.id);
      } catch (err) {
        console.error("Batch upload failed:", err);
        throw err;
      }
    },
    [refillPool]
  );

  return { uploadBatch };
};
