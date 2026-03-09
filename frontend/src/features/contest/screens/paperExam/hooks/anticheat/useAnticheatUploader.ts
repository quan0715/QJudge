import { useCallback } from "react";
import {
  getAnticheatUrls,
  uploadAnticheatBatch,
} from "@/infrastructure/api/repositories/exam.repository";
import type { AnticheatUploadBatchItem } from "@/infrastructure/api/repositories/exam.repository";

export const useAnticheatUploader = (contestId: string) => {
  const uploadBatchWithRetry = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string,
      onProgress?: (count: number) => void
    ): Promise<number[]> => {
      if (!items.length) return [];

      try {
        const response = await getAnticheatUrls(contestId, items.length, {
          upload_session_id: sessionId,
        });

        const uploadPayload: AnticheatUploadBatchItem[] = items
          .slice(0, response.items.length)
          .map((item, idx) => ({
          blob: item.blob,
          put_url: response.items[idx].put_url,
          required_headers: response.items[idx].required_headers,
        }));

        await uploadAnticheatBatch(uploadPayload);
        const uploadedCount = uploadPayload.length;
        onProgress?.(uploadedCount);
        return items.slice(0, uploadedCount).map((i) => i.id);
      } catch (err) {
        console.error("Batch upload failed:", err);
        throw err;
      }
    },
    [contestId]
  );

  return { uploadBatchWithRetry };
};
