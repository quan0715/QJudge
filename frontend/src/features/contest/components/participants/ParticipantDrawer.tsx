import { useCallback, useEffect, useState } from "react";
import { Button } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ContestParticipant, ExamStatusType, ParticipantDashboardDetail } from "@/core/entities/contest.entity";
import type { AdminPanelId } from "@/features/contest/modules/types";
import { useContest, useContestAdmin } from "@/features/contest/contexts";
import useParticipantDashboard from "@/features/contest/screens/settings/participants/useParticipantDashboard";
import { downloadParticipantReport, removeParticipant, resetParticipantExamRecord, reopenExam, unlockParticipant, updateParticipant } from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts/ToastContext";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import ParticipantDashboardPane from "./ParticipantDashboardPane";
import ParticipantOperationsPane from "./ParticipantOperationsPane";
import ParticipantStatusEditModal from "./ParticipantStatusEditModal";
import styles from "./ParticipantDrawer.module.scss";

interface ParticipantDrawerProps {
  contestId?: string;
  selectedUserId: string;
  onClose: () => void;
  onOpenPanel: (panel: AdminPanelId) => void;
  initialDetail?: ParticipantDashboardDetail;
  initialExpandedProblemId?: string;
}

export default function ParticipantDrawer({
  contestId, selectedUserId, onClose, onOpenPanel,
  initialDetail = "overview", initialExpandedProblemId,
}: ParticipantDrawerProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const { confirm, modalProps: confirmModalProps } = useConfirmModal();
  const { contest } = useContest();
  const { participants, refreshAllAdminData } = useContestAdmin();
  const classroomBound = !!contest?.isClassroomBound;
  const antiCheatEnabled = !!contest?.cheatDetectionEnabled;
  const [activeParticipantDetail, setActiveParticipantDetail] =
    useState<ParticipantDashboardDetail>(initialDetail);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] =
    useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] =
    useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const participantDashboard = useParticipantDashboard(
    contestId,
    selectedUserId,
  );

  useEffect(() => {
    setActiveParticipantDetail(initialDetail);
  }, [selectedUserId, initialDetail]);

  useEffect(() => {
    if (!selectedUserId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented &&
          !(event.target as Element)?.closest?.('[role="dialog"]:not([data-participant-drawer])')) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedUserId, onClose]);

  const refreshAfterAction = useCallback(async () => {
    await Promise.all([refreshAllAdminData(), participantDashboard.refresh()]);
  }, [refreshAllAdminData, participantDashboard]);

  const handleDownloadParticipantReport = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    try {
      await downloadParticipantReport(contestId, selectedUserId);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reportDownloaded", "報告已下載"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.downloadFailed", "下載報告失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [contestId, selectedUserId, showToast, t]);

  const openEditModal = useCallback(() => {
    if (!participantDashboard.data) return;
    setEditingParticipant(participantDashboard.data.participant);
    setEditExamStatus(
      participantDashboard.data.participant.examStatus || "not_started",
    );
    setEditLockReason(participantDashboard.data.participant.lockReason || "");
    setEditModalOpen(true);
  }, [participantDashboard.data]);

  const handleUpdateParticipant = useCallback(async () => {
    if (!contestId || !editingParticipant) return;
    setSavingStatus(true);
    try {
      await updateParticipant(contestId, Number(editingParticipant.userId), {
        exam_status: editExamStatus,
        lock_reason: editExamStatus === "locked" ? editLockReason : "",
      });
      setEditModalOpen(false);
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.statusUpdated", "參賽者狀態已更新"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.updateFailed", "更新失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setSavingStatus(false);
    }
  }, [
    contestId,
    editingParticipant,
    editExamStatus,
    editLockReason,
    refreshAfterAction,
    showToast,
    t,
  ]);

  const handleUnlock = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, Number(selectedUserId));
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.unlocked", "已解除鎖定"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.unlockFailed", "解除鎖定失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [confirm, contestId, refreshAfterAction, selectedUserId, showToast, t]);

  const handleReopenExam = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmReopen", "確定要重新開放此學生考試嗎？"),
      confirmLabel: t("participants.reopen", "重新開放"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, Number(selectedUserId));
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reopened", "已重新開放考試"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.reopenFailed", "重新開放失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [confirm, contestId, refreshAfterAction, selectedUserId, showToast, t]);

  const handleRemoveParticipant = useCallback(async () => {
    if (!contestId || !selectedUserId || !participantDashboard.data) return;
    const confirmed = await confirm({
      title: t("participants.confirmRemove", {
        name: participantDashboard.data.participant.username,
      }),
      confirmLabel: t("participants.remove", "移除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, Number(selectedUserId));
      await refreshAllAdminData();
      onClose();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.removed", "參賽者已移除"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.removeFailed", "移除參賽者失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [
    confirm,
    contestId,
    onClose,
    participantDashboard.data,
    refreshAllAdminData,
    selectedUserId,
    showToast,
    t,
  ]);

  const handleResetExamRecord = useCallback(async () => {
    if (!contestId || !selectedUserId || !participantDashboard.data) return;
    const confirmed = await confirm({
      title: t(
        "participants.confirmResetExamRecord",
        "確定要重置此學生的考試紀錄嗎？這會清除作答、成績、簽到簽退與監考事件，但不會移除參賽者。",
      ),
      confirmLabel: t("participants.actions.resetExamRecord", "重置考試紀錄"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await resetParticipantExamRecord(contestId, selectedUserId);
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.examRecordReset", "已重置考試紀錄"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.examRecordResetFailed", "重置考試紀錄失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [
    confirm,
    contestId,
    participantDashboard.data,
    refreshAfterAction,
    selectedUserId,
    showToast,
    t,
  ]);

  const handleAssistedAttendance = useCallback((purpose: "check_in" | "check_out") => {
    if (!contestId || !selectedUserId || !contest?.boundClassroomId) return;
    const returnTo = `/classrooms/${contest.boundClassroomId}/contest/${contestId}/admin`;
    const params = new URLSearchParams({
      mode: "teacher_assisted",
      purpose,
      userId: selectedUserId,
      reason: "TA assisted identity verification",
      returnTo,
    });
    window.location.assign(
      `/classrooms/${contest.boundClassroomId}/contest/${contestId}/attendance/scan?${params.toString()}`,
    );
  }, [contest?.boundClassroomId, contestId, selectedUserId]);

  const selectedParticipant = selectedUserId
    ? participants.find((participant) => participant.userId === selectedUserId)
    : null;
  const liveParticipantDashboard =
    participantDashboard.data && selectedParticipant
      ? {
          ...participantDashboard.data,
          participant: {
            ...participantDashboard.data.participant,
            ...selectedParticipant,
            startedAt: participantDashboard.data.participant.startedAt,
            leftAt: participantDashboard.data.participant.leftAt,
            lockedAt: participantDashboard.data.participant.lockedAt,
          },
        }
      : participantDashboard.data;
  const participantOverviewContent = (
    <ParticipantOperationsPane
      dashboard={liveParticipantDashboard}
      loading={participantDashboard.loading}
      error={participantDashboard.error}
      onDownloadReport={() => void handleDownloadParticipantReport()}
      onEditStatus={openEditModal}
      onUnlock={() => void handleUnlock()}
      onReopenExam={() => void handleReopenExam()}
      onAssistedAttendance={contest?.attendanceCheckEnabled ? handleAssistedAttendance : undefined}
      onResetExamRecord={() => void handleResetExamRecord()}
      onRemoveParticipant={
        classroomBound ? undefined : () => void handleRemoveParticipant()
      }
      onOpenDetail={setActiveParticipantDetail}
      onOpenGrading={() => onOpenPanel(contest?.contestType === "coding" ? "standings" : "grading")}
      onOpenProctoring={() => onOpenPanel("proctoring")}
      showViolationKpi={antiCheatEnabled}
    />
  );

  return (
    <>
      <AnimatePresence>
        {selectedUserId ? (
          <motion.div
            className={styles.participantDrawerLayer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <motion.button
              type="button"
              className={styles.participantDrawerBackdrop}
              aria-label={t(
                "adminOverview.command.drawer.closeBackdrop",
                "關閉學生詳細資訊背景",
              )}
              onClick={() => onClose()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            />
            <motion.aside
              className={styles.participantDrawer}
              role="dialog"
              data-participant-drawer
              aria-modal="true"
              aria-label={t(
                "adminOverview.command.drawer.ariaLabel",
                "學生詳細資訊",
              )}
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className={styles.participantDrawerToolbar}>
                <h3>{t("adminOverview.command.drawer.title", "學生詳細資訊")}</h3>
                <Button
                  kind="ghost"
                  hasIconOnly
                  renderIcon={Close}
                  iconDescription={t(
                    "adminOverview.command.drawer.close",
                    "關閉學生詳細資訊",
                  )}
                  onClick={() => onClose()}
                />
              </div>
              <div className={styles.participantDrawerBody}>
                <ParticipantDashboardPane
                  contestId={contestId}
                  dashboard={liveParticipantDashboard}
                  initialExpandedProblemId={initialExpandedProblemId}
                  loading={participantDashboard.loading}
                  error={participantDashboard.error}
                  activeDetail={activeParticipantDetail}
                  overviewContent={participantOverviewContent}
                  onDetailChange={setActiveParticipantDetail}
                  onDownloadReport={() => void handleDownloadParticipantReport()}
                  onEditStatus={openEditModal}
                  onUnlock={() => void handleUnlock()}
                  onReopenExam={() => void handleReopenExam()}
                  onRemoveParticipant={
                    classroomBound
                      ? undefined
                      : () => void handleRemoveParticipant()
                  }
                  onOpenGrading={() => onOpenPanel(contest?.contestType === "coding" ? "standings" : "grading")}
                  onRefreshEvents={participantDashboard.refresh}
                />
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ParticipantStatusEditModal
        open={editModalOpen}
        saving={savingStatus}
        participantUsername={editingParticipant?.username}
        examStatus={editExamStatus}
        lockReason={editLockReason}
        onClose={() => setEditModalOpen(false)}
        onSubmit={() => void handleUpdateParticipant()}
        onExamStatusChange={setEditExamStatus}
        onLockReasonChange={setEditLockReason}
      />

      <ConfirmModal {...confirmModalProps} />
    </>
  );
}
