import { useCallback, useState } from "react";

import type {
  AttendancePhotoKind,
  AttendancePurpose,
} from "@/core/entities/contest.entity";
import { getAttendanceErrorMessage } from "@/features/contest/attendance/attendanceErrorMessages";
import { createAttendanceEvent } from "@/infrastructure/api/repositories/attendance.repository";
import {
  confirmEvidenceUpload,
  createEvidenceUploadIntent,
} from "@/infrastructure/api/repositories/exam.repository";

import type { AttendancePhotoRequirement, AttendanceTranslate } from "../lib/photoRequirements";
import type { HapticPattern } from "./useHaptics";

export interface AttendanceSubmitCredential {
  mode?: "student_self_scan" | "teacher_assisted";
  purpose: AttendancePurpose;
  token?: string;
  manualCode?: string;
  userId?: string | number;
  reason?: string;
}

export interface SubmitArgs {
  scan: AttendanceSubmitCredential;
  photoRequirements: AttendancePhotoRequirement[];
  photoBlobs: Partial<Record<AttendancePhotoKind, Blob>>;
}

export interface UseAttendanceSubmitOptions {
  contestId: string | undefined;
  tr: AttendanceTranslate;
  haptics: (pattern: HapticPattern) => void;
  onSuccess?: () => void;
}

export interface UseAttendanceSubmitResult {
  isSubmitting: boolean;
  isDone: boolean;
  submitError: string | null;
  submit: (args: SubmitArgs) => Promise<void>;
  clearSubmitError: () => void;
  reset: () => void;
}

export function useAttendanceSubmit({
  contestId,
  tr,
  haptics,
  onSuccess,
}: UseAttendanceSubmitOptions): UseAttendanceSubmitResult {
  const [isSubmitting, setSubmitting] = useState(false);
  const [isDone, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = useCallback<UseAttendanceSubmitResult["submit"]>(
    async ({ scan, photoRequirements, photoBlobs }) => {
      if (!contestId) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const captured = photoRequirements.map((requirement, index) => ({
          requirement,
          blob: photoBlobs[requirement.id],
          seq: index + 1,
        }));
        const missing = captured.find((p) => !p.blob);
        if (missing) {
          throw new Error(
            tr("attendance.errors.photoMissing", "{{label}}尚未拍攝完成", {
              label: missing.requirement.label,
            }),
          );
        }
        const event = await createAttendanceEvent(
          contestId,
          scan.mode === "teacher_assisted"
            ? {
                mode: "teacher_assisted",
                purpose: scan.purpose,
                user_id: scan.userId ?? "",
                reason: scan.reason || "TA assisted identity verification",
              }
            : {
                mode: "student_self_scan",
                purpose: scan.purpose,
                token: scan.token,
                manualCode: scan.manualCode,
                client_observed_at_ms: Date.now(),
                device_kind: "mobile",
              },
        );
        const capturedAt = Date.now();
        const intent = await createEvidenceUploadIntent(contestId, {
          event_id: event.event_id,
          evidence_cluster_id: event.evidence_cluster_id,
          source_module: "attendance",
          evidence_mode: "audit",
          frames: captured.map((p) => ({
            client_captured_at_ms: capturedAt,
            seq: p.seq,
          })),
        });
        if (intent.items.length !== captured.length) {
          throw new Error(
            tr(
              "attendance.errors.uploadIntentIncomplete",
              "上傳工作未包含所有必要照片，請重新送出。",
            ),
          );
        }
        const confirmed: Array<{
          evidence_frame_id: string;
          object_key: string;
          byte_size: number;
        }> = [];
        for (let i = 0; i < intent.items.length; i += 1) {
          const item = intent.items[i];
          const photo = captured[i];
          if (!item || !photo?.blob) continue;
          const response = await fetch(item.put_url, {
            method: "PUT",
            headers: item.required_headers || { "Content-Type": "image/webp" },
            body: photo.blob,
          });
          if (!response.ok) {
            throw new Error(
              tr(
                "attendance.errors.photoUploadFailed",
                "照片上傳失敗，請重新送出。",
              ),
            );
          }
          confirmed.push({
            evidence_frame_id: item.evidence_frame_id,
            object_key: item.object_key,
            byte_size: photo.blob.size,
          });
        }
        await confirmEvidenceUpload(contestId, {
          event_id: event.event_id,
          upload_session_id: intent.upload_session_id,
          frames: confirmed,
        });
        haptics("submit-success");
        setSubmitting(false);
        setDone(true);
        onSuccess?.();
      } catch (err) {
        haptics("error");
        setSubmitting(false);
        setSubmitError(getAttendanceErrorMessage(err, tr, scan.purpose));
      }
    },
    [contestId, haptics, onSuccess, tr],
  );

  const clearSubmitError = useCallback(() => setSubmitError(null), []);
  const reset = useCallback(() => {
    setSubmitting(false);
    setDone(false);
    setSubmitError(null);
  }, []);

  return {
    isSubmitting,
    isDone,
    submitError,
    submit,
    clearSubmitError,
    reset,
  };
}
