import { useCallback } from "react";
import {
  confirmEvidenceUpload,
  createEvidenceUploadIntent,
  type EvidenceMode,
  type EvidenceSourceModule,
} from "@/infrastructure/api/repositories/exam.repository";

export interface EvidenceUploadContext {
  eventId: number | string;
  evidenceClusterId?: string;
  evidenceMode: EvidenceMode;
  sourceModule?: EvidenceSourceModule;
  unavailableReason?: string;
}

export interface UploadedEvidenceFrame {
  id: number;
  createdAt: number;
  seq: number;
  objectKey: string;
  evidenceFrameId: number;
}

export const useAnticheatUploader = (
  contestId: string,
  module: EvidenceSourceModule = "screen_share"
) => {
  const uploadBatchDetailed = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string | null | undefined,
      onProgress?: (count: number) => void,
      context?: EvidenceUploadContext
    ): Promise<UploadedEvidenceFrame[]> => {
      if (!context?.eventId) {
        throw new Error("missing_evidence_event_id");
      }

      const uploadSessionId = sessionId || undefined;
      const intent = await createEvidenceUploadIntent(contestId, {
        event_id: context.eventId,
        evidence_cluster_id: context.evidenceClusterId,
        source_module: context.sourceModule ?? module,
        evidence_mode: context.evidenceMode,
        upload_session_id: uploadSessionId,
        frames: items.map((item) => ({
          client_captured_at_ms: item.createdAt,
          seq: item.id,
        })),
        unavailable_reason: context.unavailableReason,
      });

      if (!items.length || !intent.items.length) {
        return [];
      }

      const itemBySeq = new Map(items.map((item) => [item.id, item]));
      const uploaded: UploadedEvidenceFrame[] = [];
      const confirmFrames: Array<{
        evidence_frame_id: number;
        object_key: string;
        byte_size?: number;
      }> = [];

      try {
        await Promise.all(
          intent.items.map(async (target) => {
            const source = itemBySeq.get(target.seq);
            if (!source) return;
            const response = await fetch(target.put_url, {
              method: "PUT",
              headers: {
                ...(target.required_headers || {}),
                "Content-Type": source.blob.type || "image/webp",
              },
              body: source.blob,
            });

            if (!response.ok) {
              throw new Error(`Failed to upload evidence frame (${response.status})`);
            }

            uploaded.push({
              id: source.id,
              createdAt: source.createdAt,
              seq: target.seq,
              objectKey: target.object_key,
              evidenceFrameId: target.evidence_frame_id,
            });
            confirmFrames.push({
              evidence_frame_id: target.evidence_frame_id,
              object_key: target.object_key,
              byte_size: source.blob.size,
            });
          })
        );

        if (confirmFrames.length > 0) {
          await confirmEvidenceUpload(contestId, {
            event_id: context.eventId,
            upload_session_id: intent.upload_session_id || uploadSessionId,
            frames: confirmFrames,
          });
        }

        onProgress?.(uploaded.length);
        return uploaded.sort((left, right) => left.createdAt - right.createdAt);
      } catch (err) {
        console.error("Evidence upload failed:", err);
        throw err;
      }
    },
    [contestId, module]
  );

  const uploadBatch = useCallback(
    async (
      items: { id: number; createdAt: number; blob: Blob }[],
      sessionId: string | null | undefined,
      onProgress?: (count: number) => void,
      context?: EvidenceUploadContext
    ): Promise<number[]> => {
      const uploaded = await uploadBatchDetailed(items, sessionId, onProgress, context);
      return uploaded.map((item) => item.id);
    },
    [uploadBatchDetailed]
  );

  return { uploadBatch, uploadBatchDetailed };
};
