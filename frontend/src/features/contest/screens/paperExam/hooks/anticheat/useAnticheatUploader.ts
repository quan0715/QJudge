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
    nextSeq: number;
    items: Array<{
      seq: number;
      object_key: string;
      put_url: string;
      required_headers?: Record<string, string>;
    }>;
  }>({
    sessionId: null,
    nextSeq: 1,
    items: [],
  });

  const refillPool = useCallback(
    async (sessionId: string, requiredCount: number) => {
      if (urlPoolRef.current.sessionId !== sessionId) {
        urlPoolRef.current.sessionId = sessionId;
        urlPoolRef.current.nextSeq = 1;
        urlPoolRef.current.items = [];
      }

      while (urlPoolRef.current.items.length < requiredCount) {
        const fetchCount = Math.max(PREFETCH_BATCH_SIZE, requiredCount);
        const response = await getAnticheatUrls(contestId, fetchCount, {
          upload_session_id: sessionId,
          start_seq: urlPoolRef.current.nextSeq,
          module,
        });
        const fetched = response.items.map((item) => ({
          seq: item.seq,
          object_key: item.object_key,
          put_url: item.put_url,
          required_headers: item.required_headers,
        }));
        urlPoolRef.current.items.push(...fetched);
        urlPoolRef.current.nextSeq =
          typeof response.next_seq === "number"
            ? response.next_seq
            : urlPoolRef.current.nextSeq + fetched.length;
        if (fetched.length === 0) break;
      }
    },
    [contestId, module]
  );

  const uploadBatchDetailed = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string,
      onProgress?: (count: number) => void
    ): Promise<Array<{ id: number; createdAt: number; seq: number; objectKey: string }>> => {
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

        return items.slice(0, uploadedCount).map((item, idx) => ({
          id: item.id,
          createdAt: item.createdAt,
          seq: poolItems[idx].seq,
          objectKey: poolItems[idx].object_key,
        }));
      } catch (err) {
        console.error("Batch upload failed:", err);
        throw err;
      }
    },
    [refillPool]
  );

  const uploadBatch = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string,
      onProgress?: (count: number) => void
    ): Promise<number[]> => {
      const uploaded = await uploadBatchDetailed(items, sessionId, onProgress);
      return uploaded.map((item) => item.id);
    },
    [uploadBatchDetailed]
  );

  return { uploadBatch, uploadBatchDetailed };
};
