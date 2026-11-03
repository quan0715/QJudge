import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExamStatusType } from "@/core/entities/contest.entity";
import {
  downloadParticipantReport,
  reopenExam,
  resetParticipantExamRecord,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts/ToastContext";
import { useConfirmModal } from "@/shared/ui/modal";

interface ParticipantActionsArgs {
  contestId: string;
  userId: string | null;
  classroomId?: string | null;
  onChanged: () => Promise<void>;
}

interface ActionCopy {
  success: [key: string, fallback: string];
  failure: [key: string, fallback: string];
  confirm?: { title: [key: string, fallback: string]; confirmLabel: [key: string, fallback: string] };
  refresh?: boolean;
}

export const useParticipantActions = ({ contestId, userId, classroomId, onChanged }: ParticipantActionsArgs) => {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const { confirm, modalProps: confirmModalProps } = useConfirmModal();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (copy: ActionCopy, action: (id: string) => Promise<unknown>): Promise<boolean> => {
      if (!contestId || !userId) return false;
      if (copy.confirm) {
        const confirmed = await confirm({
          title: t(...copy.confirm.title),
          confirmLabel: t(...copy.confirm.confirmLabel),
          cancelLabel: t("button.cancel", "取消"),
          danger: true,
        });
        if (!confirmed) return false;
      }
      setBusy(true);
      try {
        await action(userId);
        if (copy.refresh !== false) await onChanged();
        showToast({ kind: "success", title: t("common.success", "成功"), subtitle: t(...copy.success) });
        return true;
      } catch (error) {
        showToast({
          kind: "error",
          title: t("common.error", "錯誤"),
          subtitle: error instanceof Error ? error.message : t(...copy.failure),
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [confirm, contestId, onChanged, showToast, t, userId],
  );

  const unlock = useCallback(
    () =>
      run(
        {
          confirm: {
            title: ["participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"],
            confirmLabel: ["participants.unlock", "解除"],
          },
          success: ["participants.unlocked", "已解除鎖定"],
          failure: ["participants.unlockFailed", "解除鎖定失敗"],
        },
        (id) => unlockParticipant(contestId, Number(id)),
      ),
    [contestId, run],
  );

  const reopen = useCallback(
    () =>
      run(
        {
          confirm: {
            title: ["participants.confirmReopen", "確定要重新開放此學生考試嗎？"],
            confirmLabel: ["participants.reopen", "重新開放"],
          },
          success: ["participants.reopened", "已重新開放考試"],
          failure: ["participants.reopenFailed", "重新開放失敗"],
        },
        (id) => reopenExam(contestId, Number(id)),
      ),
    [contestId, run],
  );

  const resetExamRecord = useCallback(
    () =>
      run(
        {
          confirm: {
            title: [
              "participants.confirmResetExamRecord",
              "確定要重置此學生的考試紀錄嗎？這會清除作答、成績、簽到簽退與監考事件，但不會移除參賽者。",
            ],
            confirmLabel: ["participants.actions.resetExamRecord", "重置考試紀錄"],
          },
          success: ["participants.examRecordReset", "已重置考試紀錄"],
          failure: ["participants.examRecordResetFailed", "重置考試紀錄失敗"],
        },
        (id) => resetParticipantExamRecord(contestId, id),
      ),
    [contestId, run],
  );

  const lock = useCallback(
    (reason: string) =>
      run(
        { success: ["participants.locked", "已鎖定"], failure: ["participants.lockFailed", "鎖定失敗"] },
        (id) => updateParticipant(contestId, Number(id), { exam_status: "locked", lock_reason: reason.trim() }),
      ),
    [contestId, run],
  );

  const updateStatus = useCallback(
    (status: ExamStatusType, lockReason: string) =>
      run(
        {
          success: ["participants.statusUpdated", "參賽者狀態已更新"],
          failure: ["participants.updateFailed", "更新失敗"],
        },
        (id) =>
          updateParticipant(contestId, Number(id), {
            exam_status: status,
            lock_reason: status === "locked" ? lockReason : "",
          }),
      ),
    [contestId, run],
  );

  const downloadReport = useCallback(
    () =>
      run(
        {
          success: ["participants.reportDownloaded", "報告已下載"],
          failure: ["participants.downloadFailed", "下載報告失敗"],
          refresh: false,
        },
        (id) => downloadParticipantReport(contestId, id),
      ),
    [contestId, run],
  );

  const startAssistedAttendance = useCallback(
    (purpose: "check_in" | "check_out") => {
      if (!contestId || !userId || !classroomId) return;
      const params = new URLSearchParams({
        mode: "teacher_assisted",
        purpose,
        userId,
        reason: "TA assisted identity verification",
        returnTo: `/classrooms/${classroomId}/contest/${contestId}/admin?panel=participants&user=${userId}`,
      });
      window.location.assign(`/classrooms/${classroomId}/contest/${contestId}/attendance/scan?${params.toString()}`);
    },
    [classroomId, contestId, userId],
  );

  return {
    busy,
    unlock,
    reopen,
    resetExamRecord,
    lock,
    updateStatus,
    downloadReport,
    startAssistedAttendance,
    confirmModalProps,
  };
};

export type ParticipantActions = ReturnType<typeof useParticipantActions>;
