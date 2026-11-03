import { useCallback, useEffect, useState } from "react";
import { Button } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ExamStatusType, ParticipantDashboardDetail } from "@/core/entities/contest.entity";
import type { AdminPanelId } from "@/features/contest/modules/types";
import { useContest, useContestAdmin } from "@/features/contest/contexts";
import useParticipantDashboard from "@/features/contest/hooks/useParticipantDashboard";
import { useParticipantActions } from "@/features/contest/hooks/useParticipantActions";
import { ConfirmModal } from "@/shared/ui/modal";
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
  const { contest } = useContest();
  const { participants, refreshAllAdminData } = useContestAdmin();
  const antiCheatEnabled = !!contest?.cheatDetectionEnabled;
  const [activeParticipantDetail, setActiveParticipantDetail] =
    useState<ParticipantDashboardDetail>(initialDetail);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editExamStatus, setEditExamStatus] =
    useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
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
  const actions = useParticipantActions({
    contestId: contestId || "",
    userId: selectedUserId,
    onChanged: refreshAfterAction,
  });

  const openEditModal = useCallback(() => {
    if (!participantDashboard.data) return;
    setEditExamStatus(
      participantDashboard.data.participant.examStatus || "not_started",
    );
    setEditLockReason(participantDashboard.data.participant.lockReason || "");
    setEditModalOpen(true);
  }, [participantDashboard.data]);

  const handleUpdateParticipant = useCallback(async () => {
    await actions.updateStatus(editExamStatus, editLockReason);
    setEditModalOpen(false);
  }, [actions, editExamStatus, editLockReason]);

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
      onDownloadReport={() => void actions.downloadReport()}
      onEditStatus={openEditModal}
      onUnlock={() => void actions.unlock()}
      onReopenExam={() => void actions.reopen()}
      onAssistedAttendance={contest?.attendanceCheckEnabled ? actions.startAssistedAttendance : undefined}
      onResetExamRecord={() => void actions.resetExamRecord()}
      onOpenDetail={setActiveParticipantDetail}
      onOpenGrading={() => onOpenPanel(contest?.contestType === "coding" ? "standings" : "grading-workbench")}
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
                  onDownloadReport={() => void actions.downloadReport()}
                  onEditStatus={openEditModal}
                  onUnlock={() => void actions.unlock()}
                  onReopenExam={() => void actions.reopen()}
                  onOpenGrading={() => onOpenPanel(contest?.contestType === "coding" ? "standings" : "grading-workbench")}
                  onRefreshEvents={participantDashboard.refresh}
                />
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ParticipantStatusEditModal
        open={editModalOpen}
        saving={actions.busy}
        participantUsername={participantDashboard.data?.participant.username}
        examStatus={editExamStatus}
        lockReason={editLockReason}
        onClose={() => setEditModalOpen(false)}
        onSubmit={() => void handleUpdateParticipant()}
        onExamStatusChange={setEditExamStatus}
        onLockReasonChange={setEditLockReason}
      />

      <ConfirmModal {...actions.confirmModalProps} />
    </>
  );
}
