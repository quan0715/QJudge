import { Dropdown, Modal, TextArea } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ExamStatusType } from "@/core/entities/contest.entity";

const EXAM_STATUS_KEYS: ExamStatusType[] = [
  "not_started",
  "in_progress",
  "paused",
  "locked",
  "locked_takeover",
  "submitted",
];

interface ParticipantStatusEditModalProps {
  open: boolean;
  saving: boolean;
  participantUsername?: string;
  examStatus: ExamStatusType;
  lockReason: string;
  onClose: () => void;
  onSubmit: () => void;
  onExamStatusChange: (status: ExamStatusType) => void;
  onLockReasonChange: (reason: string) => void;
}

const ParticipantStatusEditModal = ({
  open,
  saving,
  participantUsername,
  examStatus,
  lockReason,
  onClose,
  onSubmit,
  onExamStatusChange,
  onLockReasonChange,
}: ParticipantStatusEditModalProps) => {
  const { t } = useTranslation("contest");

  return (
    <Modal
      open={open}
      modalHeading={t("participants.editModal.heading", { name: participantUsername })}
      primaryButtonText={
        saving
          ? t("common.saving", "儲存中...")
          : t("participants.editModal.save", "儲存變更")
      }
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onSubmit}
      primaryButtonDisabled={saving}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "0.5rem" }}>
        <Dropdown
          id="edit-participant-status"
          titleText={t("participants.editModal.examStatus", "考試狀態")}
          label={t("participants.editModal.selectStatus", "選擇狀態")}
          items={EXAM_STATUS_KEYS.map((id) => ({
            id,
            label: t(`examStatus.${id}`, id),
          }))}
          selectedItem={{
            id: examStatus,
            label: t(`examStatus.${examStatus}`, examStatus),
          }}
          itemToString={(item) => item?.label || ""}
          onChange={({ selectedItem }) =>
            onExamStatusChange((selectedItem?.id as ExamStatusType) || "not_started")
          }
        />

        {(examStatus === "locked" || examStatus === "locked_takeover") ? (
          <TextArea
            id="edit-participant-lock-reason"
            labelText={t("participants.editModal.lockReason", "鎖定原因")}
            value={lockReason}
            onChange={(event) => onLockReasonChange(event.target.value)}
          />
        ) : null}
      </div>
    </Modal>
  );
};

export default ParticipantStatusEditModal;
