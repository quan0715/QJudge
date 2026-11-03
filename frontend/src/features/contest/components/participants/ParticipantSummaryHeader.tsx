import { useState } from "react";
import { Button, MenuButton, MenuItem, MenuItemDivider, Modal, Tag, TextArea } from "@carbon/react";
import { DocumentTasks, Locked, Unlocked } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ExamStatusType, ParticipantDashboard } from "@/core/entities/contest.entity";
import type { ParticipantActions } from "@/features/contest/hooks/useParticipantActions";
import { ConfirmModal } from "@/shared/ui/modal";
import ParticipantStatusEditModal from "./ParticipantStatusEditModal";
import { getParticipantKpis } from "./participantKpis";
import styles from "./ParticipantSummaryHeader.module.scss";

interface ParticipantSummaryHeaderProps {
  dashboard: ParticipantDashboard;
  actions: ParticipantActions;
  showViolations: boolean;
  attendanceEnabled: boolean;
  onOpenGrading: () => void;
}

const STATUS_TAG_TYPE: Partial<Record<ExamStatusType, "green" | "blue" | "purple" | "red">> = {
  submitted: "green",
  in_progress: "blue",
  paused: "purple",
  locked: "red",
};

type HeaderAction = "unlock" | "reopen" | "lock";

export default function ParticipantSummaryHeader({
  dashboard,
  actions,
  showViolations,
  attendanceEnabled,
  onOpenGrading,
}: ParticipantSummaryHeaderProps) {
  const { t } = useTranslation("contest");
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");

  const { participant, actions: flags } = dashboard;
  const available: HeaderAction[] = [
    ...(flags.canUnlock ? (["unlock"] as const) : []),
    ...(flags.canReopenExam ? (["reopen"] as const) : []),
    ...(participant.examStatus === "in_progress" ? (["lock"] as const) : []),
  ];
  const [primary, ...secondary] = available;
  const actionMeta: Record<HeaderAction, { label: string; icon: typeof Locked; run: () => void }> = {
    unlock: { label: t("participants.actions.unlock", "解除鎖定"), icon: Unlocked, run: () => void actions.unlock() },
    reopen: { label: t("participants.actions.reopen", "重新開放考試"), icon: DocumentTasks, run: () => void actions.reopen() },
    lock: { label: t("participants.actions.lock", "鎖定"), icon: Locked, run: () => setLockModalOpen(true) },
  };
  const kpis = getParticipantKpis(dashboard, { showViolations, t });

  const submitLock = async () => {
    if (!(await actions.lock(lockReason))) return;
    setLockModalOpen(false);
    setLockReason("");
  };
  const openEditModal = () => {
    setEditStatus(participant.examStatus || "not_started");
    setEditLockReason(participant.lockReason || "");
    setEditModalOpen(true);
  };
  const submitEdit = async () => {
    if (await actions.updateStatus(editStatus, editLockReason)) setEditModalOpen(false);
  };

  return (
    <section className={styles.header}>
      <div className={styles.identityRow}>
        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{participant.displayName || participant.username}</h2>
            {participant.examStatus ? (
              <Tag size="sm" type={STATUS_TAG_TYPE[participant.examStatus] ?? "cool-gray"}>
                {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
              </Tag>
            ) : null}
          </div>
          <p className={styles.username}>@{participant.username}</p>
        </div>
        <div className={styles.actions}>
          {primary ? (
            <Button
              kind={primary === "lock" ? "danger--tertiary" : "primary"}
              size="md"
              renderIcon={actionMeta[primary].icon}
              disabled={actions.busy}
              onClick={actionMeta[primary].run}
            >
              {actionMeta[primary].label}
            </Button>
          ) : null}
          <MenuButton kind="tertiary" size="md" label={t("dashboard.moreActions", "更多操作")} menuAlignment="bottom-end">
            {secondary.map((action) => (
              <MenuItem key={action} label={actionMeta[action].label} onClick={actionMeta[action].run} />
            ))}
            {secondary.length > 0 ? <MenuItemDivider /> : null}
            {flags.canEditStatus ? (
              <MenuItem label={t("participants.actions.edit", "編輯狀態")} onClick={openEditModal} />
            ) : null}
            {flags.canDownloadReport ? (
              <MenuItem label={t("participants.actions.download", "下載報告")} onClick={() => void actions.downloadReport()} />
            ) : null}
            {dashboard.contestType === "paper_exam" && flags.canOpenGrading ? (
              <MenuItem label={t("dashboard.openGrading", "前往批改")} onClick={onOpenGrading} />
            ) : null}
            {attendanceEnabled ? (
              <>
                <MenuItemDivider />
                <MenuItem
                  label={t("participants.actions.assistedCheckIn", "人工簽到")}
                  onClick={() => actions.startAssistedAttendance("check_in")}
                />
                <MenuItem
                  label={t("participants.actions.assistedCheckOut", "人工簽退")}
                  onClick={() => actions.startAssistedAttendance("check_out")}
                />
              </>
            ) : null}
            <MenuItemDivider />
            <MenuItem
              kind="danger"
              label={t("participants.actions.resetExamRecord", "重置考試紀錄")}
              onClick={() => void actions.resetExamRecord()}
            />
          </MenuButton>
        </div>
      </div>

      {participant.lockReason ? (
        <p className={styles.notice}>
          {t("participants.headers.lockReason", "鎖定原因")}：{participant.lockReason}
        </p>
      ) : null}

      <dl className={styles.kpis}>
        {kpis.map((kpi) => (
          <div key={kpi.key} className={`${styles.kpi} ${kpi.tone === "danger" ? styles.kpiDanger : ""}`}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
          </div>
        ))}
      </dl>

      <Modal
        open={lockModalOpen}
        modalHeading={t("proctoringPanel.manualLockModalTitle", "鎖定參賽者")}
        primaryButtonText={actions.busy ? t("action.loading", "連線中...") : t("participants.actions.lock", "鎖定")}
        secondaryButtonText={t("button.cancel", "取消")}
        primaryButtonDisabled={actions.busy}
        onRequestClose={actions.busy ? undefined : () => setLockModalOpen(false)}
        onRequestSubmit={() => void submitLock()}
      >
        <TextArea
          id="participant-lock-reason"
          labelText={t("proctoringPanel.manualLockReasonLabel", "鎖定原因")}
          value={lockReason}
          maxLength={500}
          disabled={actions.busy}
          onChange={(event) => setLockReason(event.target.value)}
        />
      </Modal>
      <ParticipantStatusEditModal
        open={editModalOpen}
        saving={actions.busy}
        participantUsername={participant.username}
        examStatus={editStatus}
        lockReason={editLockReason}
        onClose={() => setEditModalOpen(false)}
        onSubmit={() => void submitEdit()}
        onExamStatusChange={setEditStatus}
        onLockReasonChange={setEditLockReason}
      />
      <ConfirmModal {...actions.confirmModalProps} />
    </section>
  );
}
